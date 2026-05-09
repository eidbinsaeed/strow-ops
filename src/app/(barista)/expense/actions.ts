"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { uploadReceiptPhoto } from "@/lib/drive/upload";

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

  if (subtotal != null && vat != null) {
    const sum = subtotal + vat;
    if (Math.abs(sum - total) > 0.02) return "pending_review";
  }

  const fields: (keyof ConfidenceMap)[] = [
    "supplier_name",
    "expense_date",
    "total",
    "payment_method",
  ];
  const anyNotHigh = fields.some(
    (f) => confidence[f] && confidence[f] !== "high",
  );

  return anyNotHigh ? "pending_review" : "confirmed";
}

export async function submitExpense(formData: FormData) {
  const session = await getBaristaSession();
  if (!session) return { error: "Not signed in" };

  const supabase = createServiceClient();

  let supplier_id = String(formData.get("supplier_id") ?? "").trim();
  const new_supplier_name = String(
    formData.get("new_supplier_name") ?? "",
  ).trim();

  if (!supplier_id && !new_supplier_name) {
    return { error: "Pick a supplier or enter a new one" };
  }

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

    await writeAudit({
      actor_id: session.bid,
      actor_type: "barista",
      action: "auto_created",
      entity_type: "supplier",
      entity_id: supplier_id,
      after_state: { name: new_supplier_name },
    });
  }

  const category_id = String(formData.get("category_id") ?? "").trim() || null;
  const expense_date = String(formData.get("expense_date") ?? "").trim();
  const invoice_number =
    String(formData.get("invoice_number") ?? "").trim() || null;
  const subtotal = parseNumberOrNull(formData.get("subtotal") as string | null);
  const vat_amount = parseNumberOrNull(
    formData.get("vat_amount") as string | null,
  );
  const total = parseNumberOrNull(formData.get("total") as string | null);
  const payment_method_raw = String(
    formData.get("payment_method") ?? "",
  ).trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const photo_data_url = String(formData.get("photo_data_url") ?? "").trim();
  const photo_media_type =
    String(formData.get("photo_media_type") ?? "").trim() || "image/jpeg";

  if (!expense_date) return { error: "Expense date is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
    return { error: "Date must be in YYYY-MM-DD format" };
  }
  if (total == null || total <= 0) {
    return { error: "Total must be a positive number" };
  }
  if (!VALID_PAYMENT_METHODS.includes(payment_method_raw as PaymentMethod)) {
    return { error: "Pick a valid payment method" };
  }
  const payment_method = payment_method_raw as PaymentMethod;

  const finalSubtotal = subtotal != null ? subtotal : total - (vat_amount ?? 0);
  const finalVat = vat_amount ?? 0;

  let confidence: ConfidenceMap = {};
  try {
    const raw = String(formData.get("ai_confidence") ?? "{}");
    confidence = JSON.parse(raw) as ConfidenceMap;
  } catch {
    // ignore
  }

  const status = deriveStatus({
    confidence,
    subtotal,
    vat: vat_amount,
    total,
  });

  const { data: inserted, error } = await supabase
    .from("expenses")
    .insert({
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
    })
    .select("id, location_id")
    .single();

  if (error || !inserted) {
    return {
      error: `Could not save expense: ${error?.message ?? "unknown error"}`,
    };
  }

  // Best-effort Drive upload + row patch.
  if (photo_data_url) {
    const { data: loc } = await supabase
      .from("locations")
      .select("slug")
      .eq("id", inserted.location_id)
      .maybeSingle();
    const slug = loc?.slug ?? "unknown";

    const upload = await uploadReceiptPhoto({
      imageDataUrl: photo_data_url,
      mediaType: photo_media_type,
      locationSlug: slug,
      kind: "expenses",
      date: expense_date,
      entityId: inserted.id,
    });

    if (upload) {
      await supabase
        .from("expenses")
        .update({
          photo_drive_url: upload.viewUrl,
          photo_drive_path: upload.displayPath,
        })
        .eq("id", inserted.id);
    }
  }

  await writeAudit({
    actor_id: session.bid,
    actor_type: "barista",
    action: status === "confirmed" ? "submitted_confirmed" : "submitted_pending",
    entity_type: "expense",
    entity_id: inserted.id,
    after_state: {
      expense_date,
      supplier_id,
      total,
      payment_method,
      status,
    },
  });

  revalidatePath("/owner");
  revalidatePath("/owner/expenses");
  revalidatePath("/owner/review");
  revalidatePath("/owner/suppliers");
  revalidatePath("/today");

  redirect("/today?submitted=expense");
}
