import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import type { Place } from "@/lib/stock";

/**
 * Adding, changing and removing count-list items. Shared by the owner's
 * actions and the staff actions (staff only with can_edit_stock_lists);
 * both check their session first and pass who did it.
 */

export type StockItemInput = {
  id: string | null;
  place: Place;
  name: string;
  unit_label: string;
  step: number | null;
  min_qty: number | null;
  reorder_qty: number | null;
  grp: string;
  supplier_id: string | null;
  inventory_item_id: string | null;
  base_per_unit: number | null;
};

export type Actor = { id: string | null; type: "owner" | "barista" };
export type Result = { ok: true } | { error: string };

/** The heading the bill trigger files new items under (migration 0022). */
export const NEW_FROM_BILLS = "New from bills";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optNum = (v: unknown, positive: boolean): number | null | "bad" => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (positive && n === 0) || n > 1_000_000) return "bad";
  return n;
};

/** Adds or changes an item on a count list. Changing `place` moves it between the lists. */
export async function upsertStockItem(input: StockItemInput, actor: Actor, locationId?: string): Promise<Result> {
  const name = String(input?.name ?? "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) return { error: "Give the item a name (up to 80 letters)." };
  const place: Place = input?.place === "store" ? "store" : "shop";
  const step = optNum(input.step, true);
  const min = optNum(input.min_qty, false);
  const reorder = optNum(input.reorder_qty, true);
  const bpu = optNum(input.base_per_unit, true);
  if (step === "bad") return { error: "The step must be more than 0." };
  if (min === "bad") return { error: "Check the minimum." };
  if (reorder === "bad") return { error: "Check the usual order." };
  if (bpu === "bad") return { error: "Check the recipe units per count unit." };
  const supplier = input.supplier_id && UUID.test(input.supplier_id) ? input.supplier_id : null;
  const inv = input.inventory_item_id && UUID.test(input.inventory_item_id) ? input.inventory_item_id : null;

  const db = createServiceClient();
  const values = {
    name,
    unit_label: String(input.unit_label ?? "").trim().slice(0, 40) || "pieces",
    step: step ?? 1,
    min_qty: min,
    reorder_qty: reorder,
    grp: String(input.grp ?? "").trim().slice(0, 40) || "Other",
    supplier_id: supplier,
    inventory_item_id: inv,
    base_per_unit: inv ? bpu : null,
  };
  const dup = (msg: string) => (/uniq_stock_items_active_name/.test(msg) ? `"${name}" is already on the ${place === "shop" ? "shop" : "store-room"} list.` : msg);

  if (input.id) {
    if (!UUID.test(input.id)) return { error: "Unknown item" };
    const { data: before } = await db.from("stock_items").select("*").eq("id", input.id).maybeSingle();
    if (!before) return { error: "This item was removed. Reload the page." };
    const b = before as Record<string, unknown>;
    if (locationId && b.location_id !== locationId) return { error: "Unknown item" };
    let sort = Number(b.sort) || 0;
    if (b.place !== place) {
      // Moved to the other list: goes after everything there, in its heading if that heading exists.
      sort = await nextSort(db, String(b.location_id), place, values.grp);
    }
    const { error } = await db.from("stock_items").update({ ...values, place, sort }).eq("id", input.id);
    if (error) return { error: dup(error.message) };
    await writeAudit({
      actor_id: actor.id,
      actor_type: actor.type,
      action: "updated",
      entity_type: "stock_item",
      entity_id: input.id,
      before_state: b,
      after_state: { ...values, place },
    });
    return { ok: true };
  }

  let lid = locationId ?? null;
  if (!lid) {
    const { data: loc } = await db.from("locations").select("id").eq("is_active", true).limit(1).maybeSingle();
    lid = (loc as { id: string } | null)?.id ?? null;
  }
  if (!lid) return { error: "No active location" };
  const sort = await nextSort(db, lid, place, values.grp);
  const { data, error } = await db
    .from("stock_items")
    .insert({ ...values, place, sort, location_id: lid, source: "manual" })
    .select("id")
    .single();
  if (error) return { error: dup(error.message) };
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "created",
    entity_type: "stock_item",
    entity_id: (data as { id: string }).id,
    after_state: { ...values, place },
  });
  return { ok: true };
}

/** New items go last in their heading (or last on the list for a new heading). */
async function nextSort(db: ReturnType<typeof createServiceClient>, locationId: string, place: Place, grp: string): Promise<number> {
  const { data: rows } = await db.from("stock_items").select("grp, sort").eq("location_id", locationId).eq("place", place).eq("is_active", true);
  const list = (rows ?? []) as { grp: string; sort: number }[];
  const inGroup = list.filter((r) => r.grp === grp).map((r) => Number(r.sort) || 0);
  return (inGroup.length ? Math.max(...inGroup) : Math.max(0, ...list.map((r) => Number(r.sort) || 0)) + 90) + 5;
}

/** Takes an item off its list. Its past counts stay. */
export async function deactivateStockItem(id: string, actor: Actor, locationId?: string): Promise<Result> {
  if (!UUID.test(id)) return { error: "Unknown item" };
  const db = createServiceClient();
  let q = db.from("stock_items").update({ is_active: false }).eq("id", id);
  if (locationId) q = q.eq("location_id", locationId);
  const { error } = await q;
  if (error) return { error: error.message };
  await writeAudit({ actor_id: actor.id, actor_type: actor.type, action: "removed", entity_type: "stock_item", entity_id: id });
  return { ok: true };
}

/** May this staff member change the count lists? Read fresh each time so the owner's switch takes effect at once. */
export async function staffCanEditLists(baristaId: string): Promise<boolean> {
  const { data } = await createServiceClient().from("baristas").select("can_edit_stock_lists, is_active").eq("id", baristaId).maybeSingle();
  const r = data as { can_edit_stock_lists: boolean | null; is_active: boolean } | null;
  return !!r && r.is_active && r.can_edit_stock_lists === true;
}
