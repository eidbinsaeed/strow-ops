/**
 * Delivery-app fees, worked out from each day's app sales (the barista closing, or the POS report
 * until the closing comes in). No invoices are entered: Strow applies a fixed rate to each app's total.
 *
 * Rates set by the owner on 12 Oct 2026. Talabat's comes from invoice 15622709 (3–5 Oct 2026):
 *   commission 360.11 + payment fees 27.37 on gross sales 1,081.29 = 35.8% (Talabat calls it "30%").
 *   Keeta 30%, Beanz 30%.
 *   Apps combined (days before ~22 Sep 2026, when the POS printed one "Online payment" line): 33%,
 *   the three rates blended by the app mix since the split started.
 * Promotions / marketing the owner runs on the apps are left out on purpose.
 *
 * To change a rate, add a row with the day it starts: older days keep the rate they had.
 * Pure (no database), so it can be checked on its own.
 */

export type AppKey = "talabat" | "keeta" | "beanz" | "combined";
export type AppRates = Record<AppKey, number>;
/** Sales (or fees) per app; `combined` = apps not split by app. */
export type AppAmounts = Record<AppKey, number>;

export const APP_KEYS: AppKey[] = ["talabat", "keeta", "beanz", "combined"];

export const APP_FEE_SCHEDULE: { from: string; rates: AppRates }[] = [
  { from: "2000-01-01", rates: { talabat: 0.358, keeta: 0.3, beanz: 0.3, combined: 0.33 } },
];

/** The rates in force on a day (YYYY-MM-DD). */
export function ratesOn(date: string): AppRates {
  let r = APP_FEE_SCHEDULE[0].rates;
  for (const row of APP_FEE_SCHEDULE) if (row.from <= date) r = row.rates;
  return r;
}

/** Today's rates, for labels. */
export const currentRates = (): AppRates => APP_FEE_SCHEDULE[APP_FEE_SCHEDULE.length - 1].rates;

export type AppFees = {
  sales: AppAmounts & { total: number };
  fees: AppAmounts & { total: number };
  /** App sales after fees. */
  keep: number;
};

const zero = (): AppAmounts & { total: number } => ({ talabat: 0, keeta: 0, beanz: 0, combined: 0, total: 0 });

export const emptyFees = (): AppFees => ({ sales: zero(), fees: zero(), keep: 0 });

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** One day's app sales → fees at that day's rates. */
export function feesForDay(date: string, sales: Partial<AppAmounts>): AppFees {
  const rates = ratesOn(date);
  const out = emptyFees();
  for (const k of APP_KEYS) {
    const s = Math.max(0, n(sales[k]));
    out.sales[k] = s;
    out.fees[k] = s * rates[k];
    out.sales.total += s;
    out.fees.total += out.fees[k];
  }
  out.keep = out.sales.total - out.fees.total;
  return out;
}

/** a + b (returns a new object). */
export function addFees(a: AppFees, b: AppFees): AppFees {
  const out = emptyFees();
  for (const k of [...APP_KEYS, "total"] as const) {
    out.sales[k] = a.sales[k] + b.sales[k];
    out.fees[k] = a.fees[k] + b.fees[k];
  }
  out.keep = a.keep + b.keep;
  return out;
}

/** Sum of many days. */
export function sumFees(list: Iterable<AppFees>): AppFees {
  let t = emptyFees();
  for (const f of list) t = addFees(t, f);
  return t;
}

/** A closing row (columns as stored) → app sales. NULL app columns mean "not split": all of online is combined. */
export function appSalesOfClosing(r: {
  online_total: unknown;
  talabat_total?: unknown;
  keeta_total?: unknown;
  beanz_total?: unknown;
}): AppAmounts {
  const online = n(r.online_total);
  const split = r.talabat_total != null || r.keeta_total != null || r.beanz_total != null;
  if (!split) return { talabat: 0, keeta: 0, beanz: 0, combined: Math.max(0, online) };
  const t = n(r.talabat_total);
  const k = n(r.keeta_total);
  const b = n(r.beanz_total);
  // "Other online" (an app payment that is none of the three) is charged at the combined rate.
  return { talabat: t, keeta: k, beanz: b, combined: Math.max(0, online - t - k - b) };
}

/** 0.358 → "35.8%". */
export const rateLabel = (r: number) => `${Number((r * 100).toFixed(1))}%`;

/** "Talabat 35.8% · Keeta 30% · Beanz 30%" (Arabic names when asked). */
export function ratesText(ar = false, rates: AppRates = currentRates()): string {
  return ar
    ? `طلبات ${rateLabel(rates.talabat)} · كيتا ${rateLabel(rates.keeta)} · Beanz ${rateLabel(rates.beanz)}`
    : `Talabat ${rateLabel(rates.talabat)} · Keeta ${rateLabel(rates.keeta)} · Beanz ${rateLabel(rates.beanz)}`;
}

export function appName(k: AppKey, ar = false): string {
  if (k === "talabat") return ar ? "طلبات" : "Talabat";
  if (k === "keeta") return ar ? "كيتا" : "Keeta";
  if (k === "beanz") return "Beanz";
  return ar ? "تطبيقات مجمعة" : "Apps combined";
}
