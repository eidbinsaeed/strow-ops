/**
 * App orders at app prices.
 *
 * Talabat, Keeta and Beanz customers pay the app price (menu_items.app_price: Latte 25 on the
 * apps, 20 in the shop), but staff usually ring app orders into the POS at shop prices — and the
 * barista closing copies the POS. So the closing's app totals are short by the difference.
 * v_app_sales_daily (migration 0029) values every app order at app prices; `extra` is what the
 * POS missed that day, per app. Orders staff already rang at the app price add nothing.
 *
 * Sales, fees, "you keep" and profit add these extras to the closing figures. The closing itself
 * (the barista's count and the POS check) is left as it was entered.
 */
import { createServiceClient } from "@/lib/supabase/server";

export type AppExtra = { talabat: number; keeta: number; beanz: number; total: number };
type Num = number | string | null | undefined;
type Db = ReturnType<typeof createServiceClient>;

const N = (v: Num) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Per day (YYYY-MM-DD), the app sales the POS missed. Days without POS orders are absent. */
export async function loadAppExtras(from: string, to: string, db: Db = createServiceClient()): Promise<Map<string, AppExtra>> {
  const out = new Map<string, AppExtra>();
  const { data, error } = await db
    .from("v_app_sales_daily")
    .select("business_date, app, extra")
    .gte("business_date", from)
    .lte("business_date", to)
    .limit(5000);
  if (error) {
    console.warn("[app-prices] v_app_sales_daily:", error.message);
    return out;
  }
  for (const r of (data ?? []) as { business_date: string; app: string; extra: Num }[]) {
    const x = N(r.extra);
    if (!(x > 0) || !["talabat", "keeta", "beanz"].includes(r.app)) continue;
    const d = out.get(r.business_date) ?? { talabat: 0, keeta: 0, beanz: 0, total: 0 };
    d[r.app as "talabat" | "keeta" | "beanz"] = r2(d[r.app as "talabat" | "keeta" | "beanz"] + x);
    d.total = r2(d.total + x);
    out.set(r.business_date, d);
  }
  return out;
}

type ClosingLike = {
  closing_date: string;
  online_total: Num;
  grand_total?: Num;
  talabat_total?: Num;
  keeta_total?: Num;
  beanz_total?: Num;
};

/**
 * A closing row with that day's missed app sales added: to each app's column when the closing
 * splits the apps, otherwise to "online" (apps combined); and to the day's total.
 * Pure: returns a copy with the amounts as numbers, plus `app_extra`.
 */
export function withAppPrices<T extends ClosingLike>(row: T, extra: AppExtra | undefined): T & { app_extra: number } {
  if (!extra || !(extra.total > 0)) return { ...row, app_extra: 0 };
  const split = row.talabat_total != null || row.keeta_total != null || row.beanz_total != null;
  const out: T & { app_extra: number } = { ...row, app_extra: extra.total };
  out.online_total = r2(N(row.online_total) + extra.total);
  if ("grand_total" in row) out.grand_total = r2(N(row.grand_total) + extra.total);
  if (split) {
    out.talabat_total = r2(N(row.talabat_total) + extra.talabat);
    out.keeta_total = r2(N(row.keeta_total) + extra.keeta);
    out.beanz_total = r2(N(row.beanz_total) + extra.beanz);
  }
  return out;
}

/** Many closings at once: loads the extras for their date range and adds them. */
export async function closingsAtAppPrices<T extends ClosingLike>(rows: T[], db: Db = createServiceClient()): Promise<(T & { app_extra: number })[]> {
  if (!rows.length) return [];
  let from = rows[0].closing_date;
  let to = rows[0].closing_date;
  for (const r of rows) {
    if (r.closing_date < from) from = r.closing_date;
    if (r.closing_date > to) to = r.closing_date;
  }
  const extras = await loadAppExtras(from, to, db);
  return rows.map((r) => withAppPrices(r, extras.get(r.closing_date)));
}

/** Profit of one item sold on an app: app price before VAT, minus the app's fee on the price incl. VAT, minus the recipe cost. */
export function appItemProfit(appPrice: number, vatRate: number, feeRate: number, cost: number): { exVat: number; fee: number; profit: number; margin: number | null } {
  const exVat = appPrice / (1 + vatRate);
  const fee = appPrice * feeRate;
  const profit = exVat - fee - cost;
  return { exVat: r2(exVat), fee: r2(fee), profit: r2(profit), margin: exVat > 0 ? Math.round((profit / exVat) * 1000) / 10 : null };
}
