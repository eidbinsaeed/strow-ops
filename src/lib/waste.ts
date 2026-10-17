/**
 * Waste check (migration 0025): between two full counts ("stock takes": shop and store room
 * counted the same day), per item group:
 *   used        = stock at the first take + bought on bills − stock at the second take
 *   should use  = POS items sold × recipes, cut at the exact count times
 *   unexplained = used − should use − what staff logged as thrown away
 * The database does the maths (stock_waste); this file turns its rows into numbers and words.
 */

export type WasteStatus = "ok" | "not_counted" | "no_size" | "unit_mismatch" | "missing_bills" | "no_recipe" | "not_on_list";

export type CountedLine = { place: "shop" | "store"; name: string; unit: string; qty: number | null; per: number | null };
export type BillLine = { date: string; supplier: string | null; what: string | null; qty: number; uom: string; net: number | null; expense_id: string };
export type ThrownLine = { on: string; name: string; qty: number; unit: string; why: string | null };

export type WasteRow = {
  group_id: string;
  name: string;
  members: string[];
  base_uom: string;
  opening: number | null;
  bought: number;
  closing: number | null;
  used: number;
  should_use: number;
  logged_waste: number;
  unexplained: number;
  unit_cost: number | null;
  used_cost: number | null;
  should_cost: number | null;
  waste_cost: number | null;
  unexplained_cost: number | null;
  status: WasteStatus;
  detail: {
    start: CountedLine[] | null;
    end: CountedLine[] | null;
    bills: BillLine[] | null;
    thrown: ThrownLine[] | null;
    missing_start: boolean;
    missing_end: boolean;
  };
};

export type WastePeriod = {
  t0: string;
  t1: string;
  bills_from: string;
  bills_to: string;
  sales: number;
  sales_ex_vat: number;
  items_sold: number;
  report_days: number;
  missing_report_days: string[];
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function toWasteRow(r: Record<string, unknown>): WasteRow {
  const d = (r.detail ?? {}) as Record<string, unknown>;
  const lines = <T,>(v: unknown, f: (x: Record<string, unknown>) => T): T[] | null =>
    Array.isArray(v) ? (v as Record<string, unknown>[]).map(f) : null;
  const counted = (x: Record<string, unknown>): CountedLine => ({
    place: x.place === "store" ? "store" : "shop",
    name: String(x.name ?? ""),
    unit: String(x.unit ?? ""),
    qty: num(x.qty),
    per: num(x.per),
  });
  return {
    group_id: String(r.group_id),
    name: String(r.name ?? ""),
    members: Array.isArray(r.members) ? (r.members as unknown[]).map(String) : [],
    base_uom: String(r.base_uom ?? "pcs"),
    opening: num(r.opening),
    bought: num(r.bought) ?? 0,
    closing: num(r.closing),
    used: num(r.used) ?? 0,
    should_use: num(r.should_use) ?? 0,
    logged_waste: num(r.logged_waste) ?? 0,
    unexplained: num(r.unexplained) ?? 0,
    unit_cost: num(r.unit_cost),
    used_cost: num(r.used_cost),
    should_cost: num(r.should_cost),
    waste_cost: num(r.waste_cost),
    unexplained_cost: num(r.unexplained_cost),
    status: (String(r.status ?? "ok") as WasteStatus),
    detail: {
      start: lines(d.start, counted),
      end: lines(d.end, counted),
      bills: lines(d.bills, (x) => ({
        date: String(x.date ?? ""),
        supplier: (x.supplier as string | null) ?? null,
        what: (x.what as string | null) ?? null,
        qty: num(x.qty) ?? 0,
        uom: String(x.uom ?? ""),
        net: num(x.net),
        expense_id: String(x.expense_id ?? ""),
      })),
      thrown: lines(d.thrown, (x) => ({
        on: String(x.on ?? ""),
        name: String(x.name ?? ""),
        qty: num(x.qty) ?? 0,
        unit: String(x.unit ?? ""),
        why: (x.why as string | null) ?? null,
      })),
      missing_start: d.missing_start === true,
      missing_end: d.missing_end === true,
    },
  };
}

export function toWastePeriod(r: Record<string, unknown> | null | undefined): WastePeriod | null {
  if (!r || !r.t0 || !r.t1) return null;
  return {
    t0: String(r.t0),
    t1: String(r.t1),
    bills_from: String(r.bills_from ?? ""),
    bills_to: String(r.bills_to ?? ""),
    sales: num(r.sales) ?? 0,
    sales_ex_vat: num(r.sales_ex_vat) ?? 0,
    items_sold: num(r.items_sold) ?? 0,
    report_days: num(r.report_days) ?? 0,
    missing_report_days: Array.isArray(r.missing_report_days) ? (r.missing_report_days as unknown[]).map(String) : [],
  };
}

/**
 * How far off an item is: "fine" within 5% of what the recipes use (or under AED 5),
 * "over" when more went than the recipes and the throw-aways explain, "under" when less went
 * (a recipe that is too big, or a bill that is missing).
 */
export function verdict(r: WasteRow): "fine" | "over" | "under" {
  const base = Math.max(r.should_use, 1e-9);
  const pct = r.unexplained / base;
  const aed = Math.abs(r.unexplained_cost ?? 0);
  if (Math.abs(pct) <= 0.05 || aed < 5) return "fine";
  return r.unexplained > 0 ? "over" : "under";
}

export type WasteTotals = {
  checked: number;
  shouldCost: number;
  usedCost: number;
  wasteCost: number;
  unexplainedCost: number;
  /** Share of the recipe cost in the period that the checked items cover (0..1). */
  coverage: number;
};

export function totals(rows: WasteRow[]): WasteTotals {
  const ok = rows.filter((r) => r.status === "ok");
  const sum = (xs: WasteRow[], f: (r: WasteRow) => number | null) => xs.reduce((t, r) => t + (f(r) ?? 0), 0);
  const allShould = sum(rows.filter((r) => r.should_use > 0), (r) => r.should_cost);
  const okShould = sum(ok, (r) => r.should_cost);
  return {
    checked: ok.length,
    shouldCost: okShould,
    usedCost: sum(ok, (r) => r.used_cost),
    wasteCost: sum(ok, (r) => r.waste_cost),
    unexplainedCost: sum(ok, (r) => r.unexplained_cost),
    coverage: allShould > 0 ? okShould / allShould : 0,
  };
}

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** The full-count day (the store-room count day) on or after `from`. */
export function nextFullCount(from: string, countDay: number): string {
  let d = from;
  for (let i = 0; i < 7 && weekday(d) !== countDay; i++) d = addDays(d, 1);
  return d;
}

export const isFullCountDay = (today: string, countDay: number) => weekday(today) === countDay;

/** 1.234 kg → "1.23 kg", 12 pcs → "12 pcs". */
export function fmtBase(n: number, uom: string): string {
  const abs = Math.abs(n);
  const v = abs >= 100 ? Math.round(n) : abs >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100;
  return `${v.toLocaleString("en-US")} ${uom}`;
}
