"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor } from "@/lib/auth/owner-session";

export type ItemType = "closing" | "expense";

const TABLE: Record<ItemType, string> = {
  closing: "closings",
  expense: "expenses",
};

const REVALIDATE_PATHS: Record<ItemType, string[]> = {
  closing: ["/owner/closings", "/owner/review", "/owner"],
  expense: ["/owner/expenses", "/owner/review", "/owner"],
};

function revalidateAll(type: ItemType) {
  for (const p of REVALIDATE_PATHS[type]) revalidatePath(p);
}

function parseNumberOrNull(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

export async function confirmReviewItem(type: ItemType, id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from(TABLE[type])
    .update({ status: "confirmed" })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "confirmed",
    entity_type: type,
    entity_id: id,
    after_state: { status: "confirmed" },
  });

  revalidateAll(type);
  return { ok: true };
}

export async function rejectReviewItem(type: ItemType, id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from(TABLE[type])
    .update({ status: "rejected" })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "rejected",
    entity_type: type,
    entity_id: id,
    after_state: { status: "rejected" },
  });

  revalidateAll(type);
  return { ok: true };
}

export async function deleteReviewItem(type: ItemType, id: string) {
  const supabase = createServiceClient();

  // Capture before-state for audit before the row vanishes.
  const { data: before } = await supabase
    .from(TABLE[type])
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from(TABLE[type]).delete().eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "deleted",
    entity_type: type,
    entity_id: id,
    before_state: before ?? null,
  });

  revalidateAll(type);
  return { ok: true };
}

export async function editClosing(id: string, formData: FormData) {
  const supabase = createServiceClient();

  const { data: before } = await supabase
    .from("closings")
    .select("closing_date, cash_total, card_total, online_total, notes")
    .eq("id", id)
    .maybeSingle();

  const closing_date = String(formData.get("closing_date") ?? "").trim();
  const cash_total = parseNumberOrNull(formData.get("cash_total"));
  const card_total = parseNumberOrNull(formData.get("card_total"));
  const online_total = parseNumberOrNull(formData.get("online_total"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(closing_date)) {
    return { error: "Closing date must be YYYY-MM-DD" };
  }
  if (cash_total == null || card_total == null || online_total == null) {
    return { error: "Cash, card, and online are all required" };
  }
  if (cash_total < 0 || card_total < 0 || online_total < 0) {
    return { error: "Totals cannot be negative" };
  }

  const after = { closing_date, cash_total, card_total, online_total, notes };
  const { error } = await supabase
    .from("closings")
    .update(after)
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "edited",
    entity_type: "closing",
    entity_id: id,
    before_state: before ?? null,
    after_state: after,
  });

  revalidateAll("closing");
  return { ok: true };
}

export async function editExpense(id: string, formData: FormData) {
  const supabase = createServiceClient();

  const { data: before } = await supabase
    .from("expenses")
    .select(
      "expense_date, subtotal, vat_amount, total, payment_method, invoice_number, notes",
    )
    .eq("id", id)
    .maybeSingle();

  const expense_date = String(formData.get("expense_date") ?? "").trim();
  const subtotal = parseNumberOrNull(formData.get("subtotal")) ?? 0;
  const vat_amount = parseNumberOrNull(formData.get("vat_amount")) ?? 0;
  const total = parseNumberOrNull(formData.get("total"));
  const invoice_number =
    String(formData.get("invoice_number") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const payment_method_raw = String(
    formData.get("payment_method") ?? "",
  ).trim();
  const VALID = ["cash", "card", "bank_transfer", "credit"];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
    return { error: "Expense date must be YYYY-MM-DD" };
  }
  if (total == null || total <= 0) {
    return { error: "Total must be positive" };
  }
  if (!VALID.includes(payment_method_raw)) {
    return { error: "Pick a valid payment method" };
  }

  const after = {
    expense_date,
    subtotal,
    vat_amount,
    total,
    payment_method: payment_method_raw,
    invoice_number,
    notes,
  };
  const { error } = await supabase.from("expenses").update(after).eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "edited",
    entity_type: "expense",
    entity_id: id,
    before_state: before ?? null,
    after_state: after,
  });

  revalidateAll("expense");
  return { ok: true };
}
