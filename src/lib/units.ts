/**
 * Goods-received unit engine (shared by the barista review screen and the
 * server action, so both always compute the same numbers).
 *
 * Every purchased line is described in up to three layers:
 *
 *   4 boxes  ×  6 cartons each  ×  1 L per carton   =  24 cartons  =  24 L
 *   └ pack ┘    └ units/pack ┘     └ unit size ┘       └ count ┘      └ base ┘
 *
 * - count     = individual units received (cartons, bottles, bags, pieces)
 * - base      = the real measured amount in ONE of three base units:
 *               L (volume), kg (weight) or pcs (countable items)
 *
 * Base units make every supplier comparable: AED per litre of oat milk,
 * AED per kg of blueberries, AED per croissant — whatever the pack size.
 */

export type BaseUom = "L" | "kg" | "pcs";

export type LineKind = "goods" | "fee" | "discount" | "deposit" | "other";

export const LINE_KINDS: { v: LineKind; label: string }[] = [
  { v: "goods", label: "Item" },
  { v: "fee", label: "Fee / delivery" },
  { v: "discount", label: "Discount" },
  { v: "deposit", label: "Deposit" },
  { v: "other", label: "Other" },
];

// Measurement units → base unit + factor.
const MEASURE: Record<string, { base: BaseUom; f: number }> = {
  l: { base: "L", f: 1 },
  ltr: { base: "L", f: 1 },
  lt: { base: "L", f: 1 },
  litre: { base: "L", f: 1 },
  liter: { base: "L", f: 1 },
  ml: { base: "L", f: 0.001 },
  cl: { base: "L", f: 0.01 },
  gal: { base: "L", f: 3.78541 },
  gallon: { base: "L", f: 3.78541 },
  "fl oz": { base: "L", f: 0.0295735 },
  kg: { base: "kg", f: 1 },
  kgs: { base: "kg", f: 1 },
  kilo: { base: "kg", f: 1 },
  g: { base: "kg", f: 0.001 },
  gm: { base: "kg", f: 0.001 },
  gr: { base: "kg", f: 0.001 },
  gram: { base: "kg", f: 0.001 },
  mg: { base: "kg", f: 0.000001 },
  lb: { base: "kg", f: 0.453592 },
  oz: { base: "kg", f: 0.0283495 },
};

/** Packaging words the UI offers (free text is still allowed). */
export const COUNT_UNITS = [
  "pcs", "carton", "bottle", "can", "bag", "pack", "box", "case", "tray",
  "jar", "tub", "tin", "roll", "sachet", "loaf", "dozen", "kg", "g", "L", "ml",
] as const;

export const SIZE_UNITS = ["L", "ml", "kg", "g", "gal", "oz", "lb", "pcs"] as const;

export function measureOf(u: string | null | undefined): { base: BaseUom; f: number } | null {
  const k = (u ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!k) return null;
  if (MEASURE[k]) return MEASURE[k];
  // plurals: "litres", "grams", "gallons", "lbs"
  if (k.length > 2 && k.endsWith("s") && MEASURE[k.slice(0, -1)]) return MEASURE[k.slice(0, -1)];
  return null;
}

export type Qty = {
  count_qty?: number | null;
  count_uom?: string | null;
  unit_size?: number | null;
  size_uom?: string | null;
};

/**
 * Real received amount in a base unit.
 * - "24 carton × 1 L"   → 24 L
 * - "2.5 kg" (loose)    → 2.5 kg
 * - "12 pcs" (no size)  → 12 pcs
 * - "1 dozen"           → 12 pcs
 */
export function baseOf(q: Qty): { base_qty: number | null; base_uom: BaseUom | null } {
  const count = num(q.count_qty);
  if (count == null) return { base_qty: null, base_uom: null };

  // Count itself is a measurement (loose goods sold by weight / volume).
  const m = measureOf(q.count_uom);
  if (m) return { base_qty: round(count * m.f), base_uom: m.base };

  const size = num(q.unit_size);
  const sm = measureOf(q.size_uom);
  if (size != null && size > 0 && sm) return { base_qty: round(count * size * sm.f), base_uom: sm.base };

  // Size given in pieces (e.g. a pack of 10 cups).
  if (size != null && size > 0 && /^pc|piece|pcs|unit/i.test(q.size_uom ?? "")) {
    return { base_qty: round(count * size), base_uom: "pcs" };
  }

  if (/^doz/i.test(q.count_uom ?? "")) return { base_qty: round(count * 12), base_uom: "pcs" };
  return { base_qty: round(count), base_uom: "pcs" };
}

export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** "24 L", "1.5 kg", "20 pcs" — trims trailing zeros. */
export function fmtQty(n: number | null | undefined, uom: string | null | undefined): string {
  if (n == null) return "";
  const s = Number(n).toLocaleString("en-AE", { maximumFractionDigits: 3 });
  return uom ? `${s} ${uom}` : s;
}

/** Human line: "4 box × 6 × 1 L" or "24 carton × 1 L" or "12 pcs". */
export function describeQty(l: Qty & { pack_qty?: number | null; pack_type?: string | null; units_per_pack?: number | null }): string {
  const parts: string[] = [];
  const pq = num(l.pack_qty);
  const upp = num(l.units_per_pack);
  if (pq && upp && l.pack_type) {
    parts.push(`${fmtQty(pq, l.pack_type)} × ${upp}`);
  } else if (num(l.count_qty) != null) {
    parts.push(fmtQty(num(l.count_qty), l.count_uom ?? "pcs"));
  }
  const size = num(l.unit_size);
  if (size && l.size_uom && !measureOf(l.count_uom)) parts.push(fmtQty(size, l.size_uom));
  return parts.join(" × ");
}

/** Totals per base unit across many lines: "30 L · 1 kg · 20 pcs". */
export function sumByBase(lines: { base_qty: number | null; base_uom: string | null }[]): string {
  const acc = new Map<string, number>();
  for (const l of lines) {
    if (l.base_qty == null || !l.base_uom) continue;
    acc.set(l.base_uom, (acc.get(l.base_uom) ?? 0) + l.base_qty);
  }
  const order = ["L", "kg", "pcs"];
  return [...acc.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([u, q]) => fmtQty(q, u))
    .join(" · ");
}
