"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

type Confidence = "high" | "medium" | "low";

type ConfidenceMap = {
  supplier_name?: Confidence;
  expense_date?: Confidence;
  invoice_number?: Confidence;
  subtotal?: Confidence;
  vat_amount?: Confidence;
  total?: Confidence;
  payment_method?: Confidence;
};

function parseNumberOrNull(raw: string | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

const VALID_PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "credit",
] as const;

type PaymentMethod = (typeof VALID_PAYMENT_METHODS)[number];

function deriveStatus(args: {
  confidence: ConfidenceMap;
  subtotal: number | null;
  vat: number | null;
  total: number;
}): "confirmed" | "pending_review" {
  const { confidence, subtotal, vat, total } = args;

  // If subtotal + vat present, must reconcile to total within 0.02 AED
  if (subtotal != null && vat != null) {
    const sum = subtotal + vat;
    if (Math.abs(sum - total) > 0.02) return "pending_review";
  }

  // All key fields high?
  const fields: (keyof ConfidenceMap)[] = [
    "supplier_name",
    "expense_date",
    "total",
    "payment_method",
  ];
  const anyNotHigh = fields.some(
    (f) => confidence[f] && confidence[f] !== "high"
  );

  return anyNotHigh ? "pending_review" : "confirmed";
}

export async function submitExpense(formData: FormData) {
  const session = await getBaristaSession();
  if (!session) return { error: "Not signed in" };

  const supabase = createServiceClient();

  // Supplier handling: either an existing supplier_id, or a new supplier name
  let supplier_id = String(formData.get("supplier_id") ?? "").trim();
  const new_supplier_name = String(
    formData.get("new_supplier_name") ?? ""
  ).trim();

  if (!supplier_id && !new_supplier_name) {
    return { error: "Pick a supplier or enter a new one" };
  }

  // If barista chose to create a new supplier, do it first
  if (!supplier_id && new_supplier_name) {
    const { data: created, error: supplierError } = await supabase
      .from("suppliers")
      .insert({
        location_id: session.lid,
        name: new_supplier_name,
        notes: "Auto-created from expense submission",
      })
      .select("id")
      .single();

    if (supplierError || !created) {
      return {
        error: `Could not create supplier: ${
          supplierError?.message ?? "unknown error"
        }`,
      };
    }
    supplier_id = created.id;
  }

  const category_id = String(formData.get("category_id") ?? "").trim() || null;
  const expense_date = String(formData.get("expense_date") ?? "").trim();
  const invoice_number =
    String(formData.get("invoice_number") ?? "").trim() || null;
  const subtotal = parseNumberOrNull(formData.get("subtotal") as string | null);
  const vat_amount = parseNumberOrNull(
    formData.get("vat_amount") as string | null
  );
  const total = parseNumberOrNull(formData.get("total") as string | null);
  const payment_method_raw = String(
    formData.get("payment_method") ?? ""
  ).trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // Validation
  if (!expense_date) return { error: "Expense date is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
    return { error: "Date must be in YYYY-MM-DD format" };
  }
  if (total == null || total <= 0) {
    return { error: "Total must be a positive number" };
  }
  if (
    !VALID_PAYMENT_METHODS.includes(payment_method_raw as PaymentMethod)
  ) {
    return { error: "Pick a valid payment method" };
  }
  const payment_method = payment_method_raw as PaymentMethod;

  // Compute subtotal + vat if missing — assume 0 VAT (5% rate not applied retroactively)
  const finalSubtotal = subtotal != null ? subtotal : total - (vat_amount ?? 0);
  const finalVat = vat_amount ?? 0;

  // Confidence
  let confidence: ConfidenceMap = {};
  try {
    const raw = String(formData.get("ai_confidence") ?? "{}");
    confidence = JSON.parse(raw) as ConfidenceMap;
  } catch {
    // ignore — defaults to pending_review
  }

  const status = deriveStatus({
    confidence,
    subtotal: subtotal,
    vat: vat_amount,
    total,
  });

  const { error } = await supabase.from("expenses").insert({
    location_id: session.lid,
    barista_id: session.bid,
    supplier_id,
    category_id,
    expense_date,
    invoice_number,
    subtotal: finalSubtotal,
    vat_amount: finalVat,
    total,
    payment_method,
    notes,
    ai_confidence: confidence,
    status,
    // photo_drive_url and photo_drive_path stay null until Drive sync ships
    // (photo_storage_url does not exist per D6 — Drive primary)
  });

  if (error) {
    return { error: `Could not save expense: ${error.message}` };
  }

  revalidatePath("/owner");
  revalidatePath("/owner/expenses");
  revalidatePath("/owner/review");
  revalidatePath("/owner/suppliers");
  revalidatePath("/today");

  redirect("/today?submitted=expense");
}
