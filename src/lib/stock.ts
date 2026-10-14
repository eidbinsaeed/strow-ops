/**
 * Stock counts: what to move from the store room, what to order, how many days
 * the stock lasts. Pure functions (no database), so they can be tested alone.
 *
 * Staff count two lists (migration 0021):
 *   shop  — what is in the shop (fridge, shelves, bar), every day
 *   store — the store room, once a week
 * An item below its minimum is either brought from the store room (when the
 * store room has it) or goes on the order list, grouped by supplier.
 */

export type Place = "shop" | "store";
export const WASTE_REASONS = ["expired", "spoiled", "broken", "other"] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

/** One row of v_stock_levels: a list item and its latest count. */
export type StockLevel = {
  id: string;
  place: Place;
  name: string;
  unit_label: string;
  step: number;
  min_qty: number | null;
  reorder_qty: number | null;
  grp: string;
  sort: number;
  inventory_item_id: string | null;
  base_per_unit: number | null;
  supplier_id: string | null;
  qty: number | null;
  counted_on: string | null;
  counted_at: string | null;
  barista_name: string | null;
};

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Postgres numerics can arrive as strings; make every number a number. */
export function toLevel(r: Record<string, unknown>): StockLevel {
  return {
    id: String(r.id),
    place: r.place === "store" ? "store" : "shop",
    name: String(r.name ?? ""),
    unit_label: String(r.unit_label ?? ""),
    step: numOrNull(r.step) ?? 1,
    min_qty: numOrNull(r.min_qty),
    reorder_qty: numOrNull(r.reorder_qty),
    grp: String(r.grp ?? "Other"),
    sort: numOrNull(r.sort) ?? 0,
    inventory_item_id: (r.inventory_item_id as string | null) ?? null,
    base_per_unit: numOrNull(r.base_per_unit),
    supplier_id: (r.supplier_id as string | null) ?? null,
    qty: numOrNull(r.qty),
    counted_on: (r.counted_on as string | null) ?? null,
    counted_at: (r.counted_at as string | null) ?? null,
    barista_name: (r.barista_name as string | null) ?? null,
  };
}

/** Rounds to the item's step (0.5 kg, 5 holders…) without float noise. */
export function roundToStep(v: number, step: number, mode: "up" | "nearest" = "nearest"): number {
  const s = step > 0 ? step : 1;
  const k = v / s;
  const n = mode === "up" ? Math.ceil(k - 1e-9) : Math.round(k);
  return Math.round(n * s * 1000) / 1000;
}

/** Plain number for screens and WhatsApp: 2, 0.5, 12.25. */
export function fmtQty(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export const isLow = (l: StockLevel) => l.qty !== null && l.min_qty !== null && l.qty < l.min_qty;

/**
 * Loose name key, so the shop "Mactop cream 1 L" finds the store "Mactop cream":
 * drop anything after "·", "(" or ",", then trailing sizes, then a plural "s".
 */
export function nameKey(name: string): string {
  let k = name.toLowerCase().split(/[·(,]/)[0];
  k = k.replace(/\s+\d[\d.]*\s*(l|kg|g|ml|oz|ltr|litres?)?\b.*$/, "");
  k = k.replace(/\s+/g, " ").trim();
  if (k.length > 3 && k.endsWith("s") && !k.endsWith("ss")) k = k.slice(0, -1);
  return k;
}

/** Store-room items that hold the same thing as a shop item. */
export function storeMatches(shopItem: StockLevel, store: StockLevel[]): StockLevel[] {
  const key = nameKey(shopItem.name);
  return store.filter(
    (s) => (shopItem.inventory_item_id && s.inventory_item_id === shopItem.inventory_item_id) || nameKey(s.name) === key,
  );
}

/** How much to bring or order when nothing better is set: back up to twice the minimum. */
function topUp(l: StockLevel): number {
  const min = l.min_qty ?? 0;
  const have = l.qty ?? 0;
  return Math.max(roundToStep(2 * min - have, l.step, "up"), l.step);
}

export type MoveLine = {
  item: StockLevel;
  bring: number;
  /** Store-room items with this product and their latest count (null = never counted). */
  from: { name: string; qty: number | null; unit: string }[];
};

export type OrderLine = {
  item: StockLevel;
  qty: number;
  /** "Store 2, minimum 3" etc. */
  why: string;
  /** Last bill price × quantity, before VAT; null when unknown. */
  estCost: number | null;
};

export type OrderGroup = { supplier: string; lines: OrderLine[]; total: number | null };

export type RestockPlan = { moves: MoveLine[]; orders: OrderGroup[]; lowCount: number };

export const NO_SUPPLIER = "No usual supplier";

/**
 * From the latest counts: what to bring from the store room, and what to order.
 * supplierOf: the supplier name for a list item (its own, else who sold it last).
 * unitCost: last bill price per recipe base unit (kg / L / pc) for an inventory item.
 */
export function planRestock(
  levels: StockLevel[],
  supplierOf: (l: StockLevel) => string | null,
  unitCost: (inventoryItemId: string) => number | null,
): RestockPlan {
  const shop = levels.filter((l) => l.place === "shop");
  const store = levels.filter((l) => l.place === "store");
  const moves: MoveLine[] = [];
  const order: OrderLine[] = [];

  const cost = (l: StockLevel, qty: number) => {
    if (!l.inventory_item_id || !l.base_per_unit) return null;
    const c = unitCost(l.inventory_item_id);
    return c === null ? null : Math.round(c * qty * l.base_per_unit * 100) / 100;
  };
  const addOrder = (l: StockLevel, why: string) => {
    const qty = l.reorder_qty ?? topUp(l);
    order.push({ item: l, qty, why, estCost: cost(l, qty) });
  };

  const shopLow = shop.filter(isLow);
  for (const s of shopLow) {
    const why = `Shop ${fmtQty(s.qty ?? 0)}, minimum ${fmtQty(s.min_qty ?? 0)}`;
    const m = storeMatches(s, store);
    if (!m.length) {
      addOrder(s, `${why}; not kept in the store room`);
      continue;
    }
    const inStore = m.some((x) => (x.qty ?? 0) > 0);
    const uncounted = m.every((x) => x.qty === null);
    if (inStore || uncounted) {
      moves.push({ item: s, bring: topUp(s), from: m.map((x) => ({ name: x.name, qty: x.qty, unit: x.unit_label })) });
    } else if (!m.some(isLow)) {
      // The store room is out but has no minimum that would order it: order for the shop.
      addOrder(s, `${why}; store room has none`);
    }
    // Otherwise the store-room item is low too and is ordered below.
  }

  for (const s of store.filter(isLow)) {
    const shopToo = shopLow.filter((x) => storeMatches(x, [s]).length);
    const extra = shopToo.length ? ` · shop low too (${shopToo.map((x) => fmtQty(x.qty ?? 0)).join(", ")})` : "";
    addOrder(s, `Store ${fmtQty(s.qty ?? 0)}, minimum ${fmtQty(s.min_qty ?? 0)}${extra}`);
  }

  const groups = new Map<string, OrderLine[]>();
  for (const o of order) {
    const k = supplierOf(o.item) || NO_SUPPLIER;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const orders = [...groups.entries()]
    .map(([supplier, lines]) => ({
      supplier,
      lines,
      total: lines.every((l) => l.estCost !== null) ? Math.round(lines.reduce((t, l) => t + (l.estCost ?? 0), 0) * 100) / 100 : null,
    }))
    .sort((a, b) => (a.supplier === NO_SUPPLIER ? 1 : b.supplier === NO_SUPPLIER ? -1 : a.supplier.localeCompare(b.supplier)));

  return { moves, orders, lowCount: shopLow.length + store.filter(isLow).length };
}

/** The order list as a WhatsApp message (bold with *…*). */
export function restockText(plan: RestockPlan, dateLabel: string): string {
  const out: string[] = [`*Stock · ${dateLabel}*`];
  if (plan.moves.length) {
    out.push("", "*Bring from the store room*");
    for (const m of plan.moves) out.push(`• ${m.item.name} — ${fmtQty(m.bring)} ${m.item.unit_label}`);
  }
  for (const g of plan.orders) {
    out.push("", `*Order · ${g.supplier}*`);
    for (const l of g.lines) out.push(`• ${l.item.name} — ${fmtQty(l.qty)} ${l.item.unit_label}`);
  }
  if (!plan.moves.length && !plan.orders.length) out.push("", "Nothing below its minimum.");
  return out.join("\n");
}

export type Cover = {
  inventory_item_id: string;
  name: string;
  uom: string;
  onHand: number;
  perDay: number;
  days: number;
  /** "shop 3 bottles (14 Oct) + store 17 litres (9 Oct)" */
  detail: string;
};

const day = (iso: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

/**
 * Days of stock left = (shop + store, in recipe units) ÷ average daily use from
 * POS sales × recipes. Only items that are on a count list with a conversion
 * (base_per_unit) and that the POS recipes use.
 */
export function daysOfCover(
  levels: StockLevel[],
  usage: { inventory_item_id: string; name: string; uom: string; used: number }[],
  reportDays: number,
): Cover[] {
  if (reportDays <= 0) return [];
  const out: Cover[] = [];
  for (const u of usage) {
    if (!(u.used > 0)) continue;
    const parts = levels.filter((l) => l.inventory_item_id === u.inventory_item_id && l.base_per_unit && l.qty !== null);
    if (!parts.length) continue;
    const onHand = parts.reduce((t, l) => t + (l.qty ?? 0) * (l.base_per_unit ?? 0), 0);
    const perDay = u.used / reportDays;
    out.push({
      inventory_item_id: u.inventory_item_id,
      name: u.name,
      uom: u.uom,
      onHand: Math.round(onHand * 100) / 100,
      perDay: Math.round(perDay * 1000) / 1000,
      days: Math.round((onHand / perDay) * 10) / 10,
      detail: parts.map((l) => `${l.place} ${fmtQty(l.qty ?? 0)} ${l.unit_label} (${day(l.counted_on)})`).join(" + "),
    });
  }
  return out.sort((a, b) => a.days - b.days);
}

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/**
 * When the weekly store-room count is due: the first count day after the last count.
 * Never counted = due today.
 */
export function storeCountDue(lastCountedOn: string | null, today: string, countDay: number): { due: string; state: "upcoming" | "due" | "overdue" } {
  if (!lastCountedOn) return { due: today, state: "due" };
  let due = addDays(lastCountedOn.slice(0, 10), 1);
  for (let i = 0; i < 7 && weekday(due) !== countDay; i++) due = addDays(due, 1);
  return { due, state: due > today ? "upcoming" : due === today ? "due" : "overdue" };
}

export const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Groups items under their heading, headings in list order. */
export function groupItems<T extends { grp: string; sort: number }>(items: T[]): { name: string; items: T[] }[] {
  const sorted = [...items].sort((a, b) => a.sort - b.sort);
  const out: { name: string; items: T[] }[] = [];
  for (const it of sorted) {
    const g = out.find((x) => x.name === it.grp);
    if (g) g.items.push(it);
    else out.push({ name: it.grp, items: [it] });
  }
  return out;
}
