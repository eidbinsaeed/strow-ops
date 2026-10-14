"use server";

import { revalidatePath } from "next/cache";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { saveSettings } from "@/lib/settings";
import type { Place } from "@/lib/stock";

type Result = { ok: true } | { error: string };

function refresh() {
  revalidatePath("/owner/stock");
  revalidatePath("/owner/stock/lists");
  revalidatePath("/home");
  revalidatePath("/stock/shop");
  revalidatePath("/stock/store");
}

/** The switches that show Shop stock / Store room count on the staff app. */
export async function setStockSwitch(kind: Place, on: boolean): Promise<Result> {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  try {
    await saveSettings(kind === "shop" ? { staffShopCount: !!on } : { staffStoreCount: !!on });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  refresh();
  return { ok: true };
}

export async function setStoreCountDay(day: number): Promise<Result> {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "Pick a day" };
  try {
    await saveSettings({ storeCountDay: day });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  refresh();
  return { ok: true };
}

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optNum = (v: unknown, positive: boolean): number | null | "bad" => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (positive && n === 0) || n > 1_000_000) return "bad";
  return n;
};

/** Adds or changes an item on a count list. */
export async function saveStockItem(input: StockItemInput): Promise<Result> {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
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

  if (input.id) {
    if (!UUID.test(input.id)) return { error: "Unknown item" };
    const { data: before } = await db.from("stock_items").select("*").eq("id", input.id).maybeSingle();
    if (!before) return { error: "This item was removed. Reload the page." };
    const { error } = await db.from("stock_items").update(values).eq("id", input.id);
    if (error) return { error: /uniq_stock_items_active_name/.test(error.message) ? `"${name}" is already on this list.` : error.message };
    await writeAudit({ actor_id: null, actor_type: "owner", action: "updated", entity_type: "stock_item", entity_id: input.id, before_state: before as Record<string, unknown>, after_state: values });
  } else {
    const { data: loc } = await db.from("locations").select("id").eq("is_active", true).limit(1).maybeSingle();
    if (!loc) return { error: "No active location" };
    // New items go last in their heading (or last on the list for a new heading).
    const { data: rows } = await db.from("stock_items").select("grp, sort").eq("place", place).eq("is_active", true);
    const list = (rows ?? []) as { grp: string; sort: number }[];
    const inGroup = list.filter((r) => r.grp === values.grp).map((r) => r.sort);
    const sort = (inGroup.length ? Math.max(...inGroup) : Math.max(0, ...list.map((r) => r.sort)) + 90) + 5;
    const { data, error } = await db
      .from("stock_items")
      .insert({ ...values, place, sort, location_id: (loc as { id: string }).id })
      .select("id")
      .single();
    if (error) return { error: /uniq_stock_items_active_name/.test(error.message) ? `"${name}" is already on this list.` : error.message };
    await writeAudit({ actor_id: null, actor_type: "owner", action: "created", entity_type: "stock_item", entity_id: (data as { id: string }).id, after_state: { ...values, place } });
  }
  refresh();
  return { ok: true };
}

/** Takes an item off its list. Its past counts stay. */
export async function removeStockItem(id: string): Promise<Result> {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  if (!UUID.test(id)) return { error: "Unknown item" };
  const db = createServiceClient();
  const { error } = await db.from("stock_items").update({ is_active: false }).eq("id", id);
  if (error) return { error: error.message };
  await writeAudit({ actor_id: null, actor_type: "owner", action: "removed", entity_type: "stock_item", entity_id: id });
  refresh();
  return { ok: true };
}
