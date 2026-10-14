"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { broadcastLive } from "@/lib/live";
import { sendPush } from "@/lib/push";
import { getSettings } from "@/lib/settings";
import { todayDubai } from "@/lib/dates";
import { fmtQty, WASTE_REASONS, type Place, type WasteReason } from "@/lib/stock";
import { loadRestock } from "@/lib/stock-plan";
import { deactivateStockItem, staffCanEditLists, upsertStockItem, type Result, type StockItemInput } from "@/lib/stock-items";

export type CountInput = {
  place: Place;
  lines: { id: string; qty: number }[];
  waste: { id: string; qty: number; reason: WasteReason }[];
  notes: string;
};

/** The order list after this count, ready to send: null when nothing is below its minimum. */
export type RestockSummary = { text: string; moves: number; orders: number };

export type CountResult =
  | { ok: true; updated: boolean; savedAt: string; low: string[]; restock: RestockSummary | null }
  | { ok: false; error: string };

const MAX_QTY = 100_000;

/**
 * Saves a stock count. One count per list per day: saving again the same day
 * replaces that day's count (so a fix doesn't add the waste twice).
 */
export async function saveStockCount(input: CountInput): Promise<CountResult> {
  const session = await getBaristaSession();
  if (!session) return { ok: false, error: "Please log in again." };

  const place: Place = input?.place === "store" ? "store" : "shop";
  const settings = await getSettings();
  if (!(place === "shop" ? settings.staffShopCount : settings.staffStoreCount)) {
    return { ok: false, error: "The owner has turned this off." };
  }

  const db = createServiceClient();
  const { data: itemRows, error: itemErr } = await db
    .from("stock_items")
    .select("id, name, min_qty")
    .eq("location_id", session.lid)
    .eq("place", place)
    .eq("is_active", true);
  if (itemErr) return { ok: false, error: itemErr.message };
  const items = new Map(((itemRows ?? []) as { id: string; name: string; min_qty: number | string | null }[]).map((r) => [r.id, r]));

  const qty = new Map<string, number>();
  for (const l of Array.isArray(input?.lines) ? input.lines : []) {
    const n = Number(l?.qty);
    if (!items.has(l?.id)) return { ok: false, error: "The list changed. Go back and open it again." };
    if (!Number.isFinite(n) || n < 0 || n > MAX_QTY) return { ok: false, error: `Check the number for ${items.get(l.id)?.name}.` };
    qty.set(l.id, Math.round(n * 1000) / 1000);
  }
  if (!qty.size) return { ok: false, error: "Count at least one item." };

  const waste = new Map<string, { qty: number; reason: WasteReason }>();
  for (const w of place === "shop" && Array.isArray(input?.waste) ? input.waste : []) {
    const n = Number(w?.qty);
    const name = items.get(w?.id)?.name;
    if (!name) return { ok: false, error: "The list changed. Go back and open it again." };
    if (!qty.has(w.id)) return { ok: false, error: `Count ${name} too, then add what was thrown away.` };
    if (!Number.isFinite(n) || n <= 0 || n > MAX_QTY) return { ok: false, error: `Check the thrown-away number for ${name}.` };
    const reason = (WASTE_REASONS as readonly string[]).includes(w.reason) ? w.reason : "other";
    const prev = waste.get(w.id);
    waste.set(w.id, { qty: Math.round(((prev?.qty ?? 0) + n) * 1000) / 1000, reason: prev && prev.reason !== reason ? "other" : reason });
  }

  const notes = String(input?.notes ?? "").trim().slice(0, 1000) || null;
  const today = todayDubai();
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from("stock_counts")
    .select("id")
    .eq("location_id", session.lid)
    .eq("place", place)
    .eq("counted_on", today)
    .order("counted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let countId: string;
  const updated = !!existing;
  let oldLines: Record<string, unknown>[] = [];
  if (existing) {
    countId = (existing as { id: string }).id;
    const { data: before } = await db.from("stock_count_lines").select("count_id, stock_item_id, qty, wasted, waste_reason").eq("count_id", countId);
    oldLines = (before ?? []) as Record<string, unknown>[];
    const { error } = await db.from("stock_counts").update({ barista_id: session.bid, counted_at: now, notes }).eq("id", countId);
    if (error) return { ok: false, error: error.message };
    const { error: delErr } = await db.from("stock_count_lines").delete().eq("count_id", countId);
    if (delErr) return { ok: false, error: delErr.message };
  } else {
    const { data, error } = await db
      .from("stock_counts")
      .insert({ location_id: session.lid, place, barista_id: session.bid, counted_on: today, counted_at: now, notes })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not save." };
    countId = (data as { id: string }).id;
  }

  const rows = [...qty.entries()].map(([id, q]) => ({
    count_id: countId,
    stock_item_id: id,
    qty: q,
    wasted: waste.get(id)?.qty ?? null,
    waste_reason: waste.get(id)?.reason ?? null,
  }));
  const { error: lineErr } = await db.from("stock_count_lines").insert(rows);
  if (lineErr) {
    if (!updated) await db.from("stock_counts").delete().eq("id", countId);
    else if (oldLines.length) await db.from("stock_count_lines").insert(oldLines);
    return { ok: false, error: lineErr.message };
  }

  const low = [...qty.entries()]
    .filter(([id, q]) => {
      const min = items.get(id)?.min_qty;
      return min !== null && min !== undefined && q < Number(min);
    })
    .map(([id, q]) => `${items.get(id)?.name} (${fmtQty(q)})`);
  const thrown = [...waste.entries()].map(([id, w]) => `${items.get(id)?.name} ${fmtQty(w.qty)}`);

  await writeAudit({
    actor_id: session.bid,
    actor_type: "barista",
    action: updated ? "updated" : "created",
    entity_type: "stock_count",
    entity_id: countId,
    after_state: { place, counted_on: today, items: qty.size, low, waste: thrown, notes },
  });

  const who = session.name.split(" ")[0];
  const title = place === "shop" ? "Shop stock" : "Store room count";
  if (place === "store" || low.length || thrown.length || notes) {
    const parts = [
      low.length ? `Low: ${low.join(", ")}` : place === "store" ? "Nothing below its minimum" : "",
      thrown.length ? `Thrown away: ${thrown.join(", ")}` : "",
      notes ? `Note: ${notes}` : "",
    ].filter(Boolean);
    after(() =>
      sendPush({
        title: `${title} · ${who}${low.length ? ` · ${low.length} low` : ""}`,
        body: parts.join(" · ").slice(0, 300),
        url: "/owner/stock",
        tag: `stock-${place}-${today}`,
      }).then(() => undefined),
    );
  }
  after(() => broadcastLive({ t: "stock_counts", id: countId }));

  revalidatePath("/home");
  revalidatePath(`/stock/${place}`);
  revalidatePath("/stock/order");
  revalidatePath("/owner/stock");

  // What to bring and what to order now, so staff can send it on WhatsApp straight away.
  let restock: RestockSummary | null = null;
  try {
    const r = await loadRestock(session.lid, today);
    if (r.plan.moves.length || r.plan.orders.length) {
      restock = { text: r.message, moves: r.plan.moves.length, orders: r.plan.orders.reduce((n, g) => n + g.lines.length, 0) };
    }
  } catch {
    restock = null;
  }
  return { ok: true, updated, savedAt: now, low, restock };
}

function refreshLists(place?: Place) {
  for (const p of ["/home", "/stock/lists", "/stock/order", "/owner/stock", "/owner/stock/lists"]) revalidatePath(p);
  if (place) revalidatePath(`/stock/${place}`);
  else for (const p of ["/stock/shop", "/stock/store"]) revalidatePath(p);
}

/** Adds or changes a count-list item — staff the owner has allowed to edit the lists. */
export async function saveStockItemAsStaff(input: StockItemInput): Promise<Result> {
  const session = await getBaristaSession();
  if (!session) return { error: "Please log in again." };
  if (!(await staffCanEditLists(session.bid))) return { error: "The owner has not allowed you to edit the lists." };
  const r = await upsertStockItem(input, { id: session.bid, type: "barista" }, session.lid);
  if ("ok" in r) refreshLists();
  return r;
}

/** Takes an item off a count list — staff the owner has allowed to edit the lists. */
export async function removeStockItemAsStaff(id: string): Promise<Result> {
  const session = await getBaristaSession();
  if (!session) return { error: "Please log in again." };
  if (!(await staffCanEditLists(session.bid))) return { error: "The owner has not allowed you to edit the lists." };
  const r = await deactivateStockItem(id, { id: session.bid, type: "barista" }, session.lid);
  if ("ok" in r) refreshLists();
  return r;
}
