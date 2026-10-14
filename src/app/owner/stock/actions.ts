"use server";

import { revalidatePath } from "next/cache";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { saveSettings } from "@/lib/settings";
import { deactivateStockItem, upsertStockItem, type Result, type StockItemInput } from "@/lib/stock-items";
import type { Place } from "@/lib/stock";

export type { StockItemInput };

function refresh() {
  for (const p of ["/owner/stock", "/owner/stock/lists", "/home", "/stock/shop", "/stock/store", "/stock/lists", "/stock/order"]) revalidatePath(p);
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

/** Adds or changes an item on a count list. */
export async function saveStockItem(input: StockItemInput): Promise<Result> {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  const r = await upsertStockItem(input, { id: null, type: "owner" });
  if ("ok" in r) refresh();
  return r;
}

/** Takes an item off its list. Its past counts stay. */
export async function removeStockItem(id: string): Promise<Result> {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  const r = await deactivateStockItem(id, { id: null, type: "owner" });
  if ("ok" in r) refresh();
  return r;
}
