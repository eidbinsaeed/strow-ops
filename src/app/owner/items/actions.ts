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

export type SplitPart = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number | null;
  inventory_item_id: string | null; // existing item id, or null
  new_item_name: string | null; // if set, create (or reuse) an item with this name
};

/**
 * Replace one receipt line with one or more lines (split a combo).
 * Each part can point at an existing item, create a new one, or be unmapped.
 * With a single part this is just an edit.
 */
export async function splitLineItem(
  originalLineId: string,
  parts: SplitPart[],
): Promise<{ ok?: boolean; error?: string }> {
  if (!originalLineId) return { error: "Missing line id" };
  if (!parts || parts.length === 0) return { error: "Add at least one item" };

  const supabase = createServiceClient();
  const { data: orig } = await supabase
    .from("expense_line_items")
    .select("expense_id, description, quantity, unit_price, line_total, inventory_item_id, position")
    .eq("id", originalLineId)
    .maybeSingle();
  if (!orig) return { error: "Line not found" };

  const { data: exp } = await supabase
    .from("expenses")
    .select("location_id")
    .eq("id", orig.expense_id)
    .maybeSingle();
  const locationId = (exp?.location_id as string | null) ?? null;

  const resolved: Array<{
    itemId: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }> = [];

  for (const p of parts) {
    let itemId = p.inventory_item_id || null;
    const newName = (p.new_item_name || "").trim();
    if (!itemId && newName && locationId) {
      const { data: existing } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("location_id", locationId)
        .ilike("name", newName)
        .maybeSingle();
      if (existing?.id) {
        itemId = existing.id as string;
      } else {
        const { data: created, error: ce } = await supabase
          .from("inventory_items")
          .insert({ location_id: locationId, name: newName, kind: "other", is_active: true })
          .select("id")
          .maybeSingle();
        if (ce) return { error: ce.message };
        itemId = (created?.id as string) ?? null;
      }
    }
    const q = Number(p.quantity) || 0;
    const up = Number(p.unit_price) || 0;
    const lt =
      p.line_total != null && !isNaN(Number(p.line_total))
        ? Number(p.line_total)
        : Math.round(q * up * 100) / 100;
    resolved.push({ itemId, description: (p.description || "").trim() || "(item)", quantity: q, unit_price: up, line_total: lt });
  }

  const first = resolved[0];
  const { error: upErr } = await supabase
    .from("expense_line_items")
    .update({
      description: first.description,
      quantity: first.quantity,
      unit_price: first.unit_price,
      line_total: first.line_total,
      inventory_item_id: first.itemId,
    })
    .eq("id", originalLineId);
  if (upErr) return { error: upErr.message };
  await learnAlias(supabase, locationId, first.itemId, first.description);

  let pos = Number(orig.position) || 0;
  for (let i = 1; i < resolved.length; i++) {
    pos += 1;
    const r = resolved[i];
    await supabase.from("expense_line_items").insert({
      expense_id: orig.expense_id,
      description: r.description,
      quantity: r.quantity,
      unit_price: r.unit_price,
      line_total: r.line_total,
      inventory_item_id: r.itemId,
      position: pos,
    });
    await learnAlias(supabase, locationId, r.itemId, r.description);
  }

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: resolved.length > 1 ? "split" : "edited",
    entity_type: "expense_line_item",
    entity_id: originalLineId,
    before_state: orig as Record<string, unknown>,
    after_state: { parts: resolved.length },
  });

  revalidateItems();
  return { ok: true };
}
