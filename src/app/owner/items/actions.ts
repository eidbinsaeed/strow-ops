"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor } from "@/lib/auth/owner-session";

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function revalidateItems() {
  for (const p of ["/owner/items", "/owner/expenses", "/owner"]) revalidatePath(p);
}

function num(v: FormDataEntryValue | null): number {
  const n = parseFloat(String(v ?? "").trim());
  return isNaN(n) ? 0 : n;
}

/** Learn a raw-text -> item mapping so future receipts auto-match. Best-effort. */
async function learnAlias(
  supabase: ReturnType<typeof createServiceClient>,
  locationId: string | null,
  itemId: string | null,
  description: string | null,
) {
  if (!locationId || !itemId || !description || !description.trim()) return;
  await supabase
    .from("item_aliases")
    .upsert(
      { location_id: locationId, inventory_item_id: itemId, raw_text: description, norm: norm(description) },
      { onConflict: "location_id,norm" },
    );
}

/** Quick single-line fix from the Items review panel. */
export async function updateLineItem(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const id = String(formData.get("line_id") ?? "");
  if (!id) return { error: "Missing line id" };

  const quantity = num(formData.get("quantity"));
  const unit_price = num(formData.get("unit_price"));
  let line_total = num(formData.get("line_total"));
  if (!line_total) line_total = Math.round(quantity * unit_price * 100) / 100;
  const rawItem = String(formData.get("inventory_item_id") ?? "").trim();
  const inventory_item_id = rawItem === "" ? null : rawItem;

  if (quantity < 0 || unit_price < 0 || line_total < 0) {
    return { error: "Numbers can't be negative" };
  }

  const supabase = createServiceClient();
  const { data: before } = await supabase
    .from("expense_line_items")
    .select("expense_id, description, quantity, unit_price, line_total, inventory_item_id")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { error: "Line not found" };

  const { error } = await supabase
    .from("expense_line_items")
    .update({ quantity, unit_price, line_total, inventory_item_id })
    .eq("id", id);
  if (error) return { error: error.message };

  if (inventory_item_id) {
    const { data: exp } = await supabase
      .from("expenses")
      .select("location_id")
      .eq("id", before.expense_id)
      .maybeSingle();
    await learnAlias(supabase, exp?.location_id ?? null, inventory_item_id, before.description);
  }

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "edited",
    entity_type: "expense_line_item",
    entity_id: id,
    before_state: before as Record<string, unknown>,
    after_state: { quantity, unit_price, line_total, inventory_item_id },
  });

  revalidateItems();
  return { ok: true };
}

export type LineDraft = {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number | null;
  inventory_item_id: string | null;
};

/** Load every line of a bill + the item catalog (for the bill-screen editor). */
export async function getExpenseLines(expenseId: string): Promise<{
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    inventory_item_id: string | null;
  }>;
  items: Array<{ id: string; name: string; kind: string | null }>;
}> {
  const supabase = createServiceClient();
  const { data: lines } = await supabase
    .from("expense_line_items")
    .select("id, description, quantity, unit_price, line_total, inventory_item_id, position")
    .eq("expense_id", expenseId)
    .order("position", { ascending: true });
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, kind")
    .eq("is_active", true)
    .order("name", { ascending: true });
  return {
    lines: (lines ?? []).map((l) => ({
      id: l.id as string,
      description: l.description as string,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      line_total: Number(l.line_total),
      inventory_item_id: (l.inventory_item_id as string | null) ?? null,
    })),
    items: (items ?? []) as Array<{ id: string; name: string; kind: string | null }>,
  };
}

/** Full reconcile of a bill's line items (edit / add / split / delete). */
export async function saveExpenseLines(
  expenseId: string,
  rows: LineDraft[],
): Promise<{ ok?: boolean; error?: string }> {
  if (!expenseId) return { error: "Missing bill id" };
  const supabase = createServiceClient();

  const { data: exp } = await supabase
    .from("expenses")
    .select("location_id")
    .eq("id", expenseId)
    .maybeSingle();
  if (!exp) return { error: "Bill not found" };

  const { data: existing } = await supabase
    .from("expense_line_items")
    .select("id")
    .eq("expense_id", expenseId);
  const existingIds = new Set((existing ?? []).map((r) => r.id as string));
  const keepIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string));

  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
  if (toDelete.length) {
    await supabase.from("expense_line_items").delete().in("id", toDelete);
  }

  let pos = 0;
  for (const r of rows) {
    const q = Number(r.quantity) || 0;
    const up = Number(r.unit_price) || 0;
    const lt =
      r.line_total != null && !isNaN(Number(r.line_total))
        ? Number(r.line_total)
        : Math.round(q * up * 100) / 100;
    const item = r.inventory_item_id || null;
    const description = (r.description || "").trim() || "(item)";
    const payload = { description, quantity: q, unit_price: up, line_total: lt, inventory_item_id: item, position: pos++ };

    if (r.id && existingIds.has(r.id)) {
      await supabase.from("expense_line_items").update(payload).eq("id", r.id);
    } else {
      await supabase.from("expense_line_items").insert({ ...payload, expense_id: expenseId });
    }
    await learnAlias(supabase, exp.location_id as string, item, description);
  }

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "edited",
    entity_type: "expense",
    entity_id: expenseId,
    after_state: { line_items_saved: rows.length, deleted: toDelete.length },
  });

  revalidateItems();
  return { ok: true };
}
