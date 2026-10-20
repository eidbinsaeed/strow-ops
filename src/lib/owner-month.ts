/**
 * The month so far, for the Money section: closings strip, payment split with
 * delivery-app fees, average day by weekday, month stats and cash on hand.
 * (Moved here from the old Pulse page; same maths.)
 */
import { createServiceClient } from "@/lib/supabase/server";
import { todayDubai } from "@/lib/dates";
import { appSalesOfClosing, feesForDay, sumFees } from "@/lib/app-fees";
import type { StripDay } from "@/components/pulse/MonthStrip";

type Num = number | string | null;
type Closing = { closing_date: string; status: string; grand_total: Num; cash_total: Num; card_total: Num; online_total: Num; talabat_total: Num; keeta_total: Num; beanz_total: Num; transactions: number | null; transactions_by_method: Record<string, number> | null };
export type CashPos = { cash_on_hand: Num; cash_in_today: Num; cash_out_today: Num; cash_withdrawn_today: Num; anchor_date: string | null; needs_opening_count: boolean | number | null };

export const N = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
export const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WD_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayLong(iso: string, ar: boolean): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return ar ? `${WD_AR[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]}` : `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export async function loadMonth(ar: boolean) {
  const db = createServiceClient();
  const today = todayDubai();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const todayNum = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthPrefix = today.slice(0, 8);
  const monthName = ar ? MONTHS_AR[m - 1] : MONTHS[m - 1];

  const [kpiRes, cashRes, closRes, itemsRes, billsRes] = await Promise.all([
    db.from("v_dashboard_kpis").select("*").limit(1),
    db.from("v_cash_position").select("*").limit(1),
    db
      .from("closings")
      .select("closing_date, status, grand_total, cash_total, card_total, online_total, talabat_total, keeta_total, beanz_total, transactions, transactions_by_method")
      .gte("closing_date", addDays(today, -120))
      .lte("closing_date", today)
      .neq("status", "rejected")
      .order("closing_date"),
    db.rpc("ai_read_query", {
      q: "select count(distinct li.inventory_item_id)::int as items, coalesce(sum(li.line_total),0)::float8 as spent from expense_line_items li join expenses e on e.id = li.expense_id where e.status = 'confirmed' and li.inventory_item_id is not null",
      max_rows: 1,
    }),
    db.from("expenses").select("total").gte("expense_date", `${monthPrefix}01`).lte("expense_date", today).neq("status", "rejected").range(0, 1999),
  ]);

  const kpi = ((kpiRes.data ?? [])[0] ?? null) as { projected_net: Num; revenue_mtd: Num; fixed_monthly: Num; days_closed_mtd: Num; days_in_month: Num } | null;
  const cash = ((cashRes.data ?? [])[0] ?? null) as CashPos | null;
  const rows = (closRes.data ?? []) as Closing[];
  const itemsRow = (Array.isArray(itemsRes.data) ? itemsRes.data[0] : null) as { items?: number; spent?: number } | null;
  const bills = (billsRes.data ?? []) as { total: Num }[];

  // Month strip
  const byDate = new Map(rows.map((r) => [r.closing_date, r]));
  const elapsed = byDate.has(today) ? todayNum : todayNum - 1;
  const days: StripDay[] = [];
  let closedCount = 0;
  let missingCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${monthPrefix}${String(d).padStart(2, "0")}`;
    const row = byDate.get(iso);
    if (row) {
      if (d <= elapsed) closedCount++;
      days.push({ iso, d, kind: "closed", value: N(row.grand_total), orders: row.transactions ?? null });
    } else if (iso === today) days.push({ iso, d, kind: "today", value: 0 });
    else if (d > todayNum) days.push({ iso, d, kind: "future", value: 0 });
    else {
      missingCount++;
      days.push({ iso, d, kind: "missing", value: 0 });
    }
  }

  const monthRows = rows.filter((r) => r.closing_date.startsWith(monthPrefix));
  const withOrders = monthRows.filter((r) => (r.transactions ?? 0) > 0);
  const monthOrders = withOrders.reduce((a, r) => a + (r.transactions ?? 0), 0);
  const monthOrderSales = withOrders.reduce((a, r) => a + N(r.grand_total), 0);
  const monthSales = monthRows.reduce((a, r) => a + N(r.grand_total), 0);
  const billsTotal = bills.reduce((a, b) => a + N(b.total), 0);

  // Payment split (month to date, else last 30 days)
  const splitRows = monthRows.length ? monthRows : rows.filter((r) => r.closing_date >= addDays(today, -30));
  const sumOf = (f: (r: Closing) => Num) => splitRows.reduce((a, r) => a + N(f(r)), 0);
  const card = sumOf((r) => r.card_total);
  const cashS = sumOf((r) => r.cash_total);
  const onlineAll = sumOf((r) => r.online_total);
  const talabat = sumOf((r) => r.talabat_total);
  const keeta = sumOf((r) => r.keeta_total);
  const beanz = sumOf((r) => r.beanz_total);
  const otherOnline = Math.max(0, onlineAll - talabat - keeta - beanz);
  const tot = card + cashS + onlineAll;
  const appFees = sumFees(splitRows.map((r) => feesForDay(r.closing_date, appSalesOfClosing(r))));
  const pct = (x: number) => (tot > 0 ? Math.round((x / tot) * 100) : 0);
  const split = [
    { k: ar ? "بطاقة" : "Card", v: card, c: "#1C1C1E" },
    { k: ar ? "طلبات" : "Talabat", v: talabat, c: "#FF5A00" },
    { k: "Beanz", v: beanz, c: "#956D51" },
    { k: ar ? "كيتا" : "Keeta", v: keeta, c: "#8E8E93" },
    { k: ar ? "تطبيقات مجمعة" : "Apps combined", v: otherOnline, c: "#1E6EF4" },
    { k: ar ? "نقد" : "Cash", v: cashS, c: "#C55300" },
  ]
    .filter((x) => x.v > 0.004)
    .map((x) => ({ ...x, pct: pct(x.v) }));

  // Orders and average order per channel — days that have the POS counts (and, for the apps, the app split).
  const CH = [
    { key: "card", label: ar ? "بطاقة" : "Card", c: "#1C1C1E" },
    { key: "talabat", label: ar ? "طلبات" : "Talabat", c: "#FF5A00" },
    { key: "beanz", label: "Beanz", c: "#956D51" },
    { key: "keeta", label: ar ? "كيتا" : "Keeta", c: "#8E8E93" },
    { key: "cash", label: ar ? "نقد" : "Cash", c: "#C55300" },
  ] as const;
  const amountOf = (r: Closing, k: (typeof CH)[number]["key"]): Num =>
    k === "card" ? r.card_total : k === "cash" ? r.cash_total : k === "talabat" ? r.talabat_total : k === "keeta" ? r.keeta_total : r.beanz_total;
  const chStats: { key: string; label: string; c: string; orders: number; sales: number; avg: number }[] = CH.map((ch) => {
    let orders = 0, sales = 0;
    for (const r of splitRows) {
      const n = r.transactions_by_method?.[ch.key];
      const amt = amountOf(r, ch.key);
      if (n == null || amt == null) continue;
      orders += Number(n) || 0;
      sales += N(amt);
    }
    return { key: ch.key, label: ch.label, c: ch.c, orders, sales, avg: orders > 0 ? sales / orders : 0 };
  }).filter((x) => x.orders > 0);
  let comboOrders = 0, comboSales = 0;
  for (const r of splitRows) {
    if (r.talabat_total != null || r.keeta_total != null || r.beanz_total != null) continue;
    const by = r.transactions_by_method;
    if (!by || N(r.online_total) <= 0) continue;
    comboOrders += ["talabat", "keeta", "beanz", "other"].reduce((a, k) => a + (Number(by[k]) || 0), 0);
    comboSales += N(r.online_total);
  }
  if (comboOrders > 0) chStats.push({ key: "apps", label: ar ? "تطبيقات (مجمعة)" : "Apps combined", c: "#1E6EF4", orders: comboOrders, sales: comboSales, avg: comboSales / comboOrders });
  const channels = chStats.sort((a, b) => b.orders - a.orders);

  // Average day by weekday (last 120 days)
  const byDow = new Map<number, { sum: number; n: number }>();
  for (const r of rows) {
    const v = N(r.grand_total);
    if (v <= 0) continue;
    const k = new Date(`${r.closing_date}T00:00:00Z`).getUTCDay();
    const a = byDow.get(k) ?? { sum: 0, n: 0 };
    a.sum += v;
    a.n += 1;
    byDow.set(k, a);
  }
  const avgs = [...byDow.entries()].map(([k, a]) => ({ k, v: a.sum / a.n })).sort((a, b) => b.v - a.v);
  const week = avgs.length > 4 ? [...avgs.slice(0, 3), avgs[avgs.length - 1]] : avgs;
  const weekMax = Math.max(1, ...week.map((w) => w.v));

  const feesConfirmedMtd = sumFees(monthRows.filter((r) => r.status === "confirmed").map((r) => feesForDay(r.closing_date, appSalesOfClosing(r)))).fees.total;
  const daysClosedMtd = N(kpi?.days_closed_mtd);
  const projected = N(kpi?.projected_net) - (daysClosedMtd > 0 ? (feesConfirmedMtd / daysClosedMtd) * N(kpi?.days_in_month) : 0);

  return {
    today,
    monthName,
    elapsed,
    closedCount,
    missingCount,
    days,
    monthSales: N(kpi?.revenue_mtd) || monthSales,
    monthOrders,
    avgOrder: monthOrders > 0 ? monthOrderSales / monthOrders : null,
    bills: { total: billsTotal, count: bills.length },
    split,
    channels,
    appFees,
    usingMonth: monthRows.length > 0,
    week,
    weekMax,
    projected,
    fixedMonthly: N(kpi?.fixed_monthly),
    items: { count: N(itemsRow?.items), spent: N(itemsRow?.spent) },
    cash,
  };
}
