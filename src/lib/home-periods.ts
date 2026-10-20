/**
 * Home: sales by Week, Month and Year, all ending on the LAST CLOSE (closings
 * arrive at the end of the day, so "today" never has figures yet).
 * Pure maths, no database — the page loads the rows and passes them in.
 */
import { addDays, MONTHS, MONTHS_AR, N, WD, WD_AR, WD_SHORT } from "@/lib/owner-month";

type Num = number | string | null;
export type HomeClosing = {
  closing_date: string;
  grand_total: Num;
  cash_total: Num;
  online_total: Num;
  talabat_total: Num;
  keeta_total: Num;
  beanz_total: Num;
  transactions: number | null;
};
export type HomeBill = { expense_date: string; total: Num };

import type { PeriodKey } from "@/lib/home-period-keys";
export { PERIOD_KEYS, type PeriodKey } from "@/lib/home-period-keys";

export type HBar = {
  key: string;
  axis: string; // label under the bar ("" to leave it blank)
  full: string; // "Sat 18 Oct", "August"
  value: number | null; // null = no close that day
  kind: "closed" | "missing" | "future" | "partial";
  projected?: number; // partial month: where it is heading
};
export type HTiles = {
  orders: number | null;
  perDay: number | null;
  avgOrder: number | null;
  appsPct: number | null;
  appsAmount: number;
  appsLead: string | null;
  bills: number;
  billsCount: number;
  billsPct: number | null;
};
export type Period = {
  key: PeriodKey;
  tab: string;
  title: string;
  range: string;
  total: number;
  change: { pct: number; label: string } | null;
  bars: HBar[];
  selected: number;
  avg: number;
  /** Bottom of the card: the dashed average line's figure, and one more figure on the other side. */
  left: { label: string; value: string } | null;
  right: { label: string; value: string } | null;
  tiles: HTiles;
};

type Day = { sales: number; cash: number; apps: number; talabat: number; keeta: number; beanz: number; orders: number | null; orderSales: number };

const LETTER_AR = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");
const dim = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // m is 0-based
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const mon3 = (m: number, ar: boolean) => (ar ? MONTHS_AR[m] : MONTHS[m].slice(0, 3));

function dayFull(s: string, ar: boolean): string {
  const d = new Date(`${s}T00:00:00Z`);
  return ar ? `${WD_AR[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]}` : `${WD_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}
function shortRange(a: string, b: string, ar: boolean): string {
  const da = new Date(`${a}T00:00:00Z`);
  const db = new Date(`${b}T00:00:00Z`);
  const sameMonth = da.getUTCMonth() === db.getUTCMonth();
  if (ar) return `${da.getUTCDate()}${sameMonth ? "" : ` ${MONTHS_AR[da.getUTCMonth()]}`} – ${db.getUTCDate()} ${MONTHS_AR[db.getUTCMonth()]}`;
  return `${da.getUTCDate()}${sameMonth ? "" : ` ${mon3(da.getUTCMonth(), false)}`} – ${db.getUTCDate()} ${mon3(db.getUTCMonth(), false)}`;
}

function byDay(rows: HomeClosing[]): Map<string, Day> {
  const out = new Map<string, Day>();
  for (const r of rows) {
    const split = r.talabat_total != null || r.keeta_total != null || r.beanz_total != null;
    const sales = N(r.grand_total);
    const d = out.get(r.closing_date) ?? { sales: 0, cash: 0, apps: 0, talabat: 0, keeta: 0, beanz: 0, orders: null, orderSales: 0 };
    d.sales += sales;
    d.cash += N(r.cash_total);
    d.apps += split ? N(r.talabat_total) + N(r.keeta_total) + N(r.beanz_total) : N(r.online_total);
    d.talabat += N(r.talabat_total);
    d.keeta += N(r.keeta_total);
    d.beanz += N(r.beanz_total);
    if ((r.transactions ?? 0) > 0) {
      d.orders = (d.orders ?? 0) + (r.transactions as number);
      d.orderSales += sales;
    }
    out.set(r.closing_date, d);
  }
  return out;
}

function sumRange(days: Map<string, Day>, from: string, to: string) {
  let sales = 0, n = 0;
  for (const [k, d] of days) if (k >= from && k <= to) { sales += d.sales; n++; }
  return { sales, n };
}

function tilesFor(days: Map<string, Day>, bills: HomeBill[], from: string, to: string, ar: boolean): HTiles {
  let sales = 0, apps = 0, talabat = 0, keeta = 0, beanz = 0, orders = 0, orderSales = 0, orderDays = 0;
  for (const [k, d] of days) {
    if (k < from || k > to) continue;
    sales += d.sales;
    apps += d.apps;
    talabat += d.talabat;
    keeta += d.keeta;
    beanz += d.beanz;
    if (d.orders != null) { orders += d.orders; orderSales += d.orderSales; orderDays++; }
  }
  const inRange = bills.filter((b) => b.expense_date >= from && b.expense_date <= to);
  const billTotal = inRange.reduce((a, b) => a + N(b.total), 0);
  const lead = [
    { k: ar ? "طلبات" : "Talabat", v: talabat },
    { k: ar ? "كيتا" : "Keeta", v: keeta },
    { k: "Beanz", v: beanz },
  ].sort((x, y) => y.v - x.v)[0];
  return {
    orders: orderDays ? orders : null,
    perDay: orderDays ? Math.round(orders / orderDays) : null,
    avgOrder: orders > 0 ? orderSales / orders : null,
    appsPct: sales > 0 ? Math.round((apps / sales) * 100) : null,
    appsAmount: apps,
    appsLead: lead.v > 0 ? lead.k : null,
    bills: billTotal,
    billsCount: inRange.length,
    billsPct: sales > 0 ? Math.round((billTotal / sales) * 100) : null,
  };
}

function changeLabel(pct: number, vs: string, ar: boolean) {
  const abs = Math.abs(pct);
  if (ar) return pct === 0 ? `مثل ${vs}` : `${pct > 0 ? "أكثر" : "أقل"} بـ${abs}٪ من ${vs}`;
  return pct === 0 ? `Same as ${vs}` : `${abs}% ${pct > 0 ? "more" : "less"} than ${vs}`;
}

/**
 * last = date of the latest close; today = Dubai date (decides whether a month is still running).
 * Returns null when there are no closings at all.
 */
export function buildPeriods(rows: HomeClosing[], bills: HomeBill[], last: string | null, today: string, ar: boolean): Record<PeriodKey, Period> | null {
  if (!last) return null;
  const days = byDay(rows);
  const ly = Number(last.slice(0, 4));
  const lm = Number(last.slice(5, 7)) - 1;
  const ld = Number(last.slice(8, 10));
  const avgOf = (bars: HBar[]) => {
    const v = bars.filter((b) => b.kind === "closed" && b.value != null).map((b) => b.value as number);
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0;
  };

  // ---- Week: the 7 days ending on the last close, against the 7 before.
  const wFrom = addDays(last, -6);
  const wBars: HBar[] = Array.from({ length: 7 }, (_, k) => {
    const s = addDays(last, k - 6);
    const dow = new Date(`${s}T00:00:00Z`).getUTCDay();
    const d = days.get(s);
    return { key: s, axis: ar ? LETTER_AR[dow] : WD[dow].slice(0, 1), full: dayFull(s, ar), value: d ? d.sales : null, kind: d ? "closed" : "missing" };
  });
  const wNow = sumRange(days, wFrom, last);
  const wPrev = sumRange(days, addDays(last, -13), addDays(last, -7));
  const wAvg = avgOf(wBars);
  const week: Period = {
    key: "week",
    tab: ar ? "أسبوع" : "Week",
    title: ar ? "آخر ٧ أيام" : "Last 7 days",
    range: shortRange(wFrom, last, ar),
    total: wNow.sales,
    change: wPrev.sales > 0 && wPrev.n >= 4 ? (() => { const pct = Math.round(((wNow.sales - wPrev.sales) / wPrev.sales) * 100); return { pct, label: changeLabel(pct, ar ? "الأسبوع الذي قبله" : "the week before", ar) }; })() : null,
    bars: wBars,
    selected: 6,
    avg: wAvg,
    left: { label: ar ? "المتوسط اليومي" : "Daily average", value: `AED ${fmt0(wAvg)}` },
    right: { label: ar ? "أيام مُقفلة" : "Days closed", value: ar ? `${wNow.n} من 7` : `${wNow.n} of 7` },
    tiles: tilesFor(days, bills, wFrom, last, ar),
  };

  // ---- Month: the month of the last close, day by day, against the same days last month.
  const mDays = dim(ly, lm);
  const mFrom = iso(ly, lm, 1);
  const running = last.slice(0, 7) === today.slice(0, 7);
  const mBars: HBar[] = Array.from({ length: mDays }, (_, k) => {
    const s = iso(ly, lm, k + 1);
    const d = days.get(s);
    const axis = [1, 8, 15, 22, 29].includes(k + 1) ? String(k + 1) : "";
    if (s > last && running) return { key: s, axis, full: dayFull(s, ar), value: null, kind: "future" };
    return { key: s, axis, full: dayFull(s, ar), value: d ? d.sales : null, kind: d ? "closed" : "missing" };
  });
  const mNow = sumRange(days, mFrom, last);
  const py = lm === 0 ? ly - 1 : ly;
  const pm = lm === 0 ? 11 : lm - 1;
  const pTo = Math.min(ld, dim(py, pm));
  const mPrev = sumRange(days, iso(py, pm, 1), iso(py, pm, pTo));
  const mAvg = avgOf(mBars);
  const projected = running && mNow.n > 0 ? (mNow.sales / mNow.n) * mDays : null;
  const monthName = ar ? MONTHS_AR[lm] : MONTHS[lm];
  const month: Period = {
    key: "month",
    tab: ar ? "شهر" : "Month",
    title: running ? (ar ? `${monthName} حتى الآن` : `${monthName} so far`) : monthName,
    range: shortRange(mFrom, last, ar),
    total: mNow.sales,
    change:
      mPrev.sales > 0 && mPrev.n >= Math.min(5, ld)
        ? (() => {
            const pct = Math.round(((mNow.sales - mPrev.sales) / mPrev.sales) * 100);
            const vs = ar ? `1–${pTo} ${MONTHS_AR[pm]}` : `1–${pTo} ${MONTHS[pm].slice(0, 3)}`;
            return { pct, label: changeLabel(pct, vs, ar) };
          })()
        : null,
    bars: mBars,
    selected: ld - 1,
    avg: mAvg,
    left: { label: ar ? "المتوسط اليومي" : "Daily average", value: `AED ${fmt0(mAvg)}` },
    right:
      projected != null
        ? { label: ar ? "في الطريق إلى" : "On track for", value: `AED ${fmt0(projected)}` }
        : { label: ar ? "أيام مُقفلة" : "Days closed", value: ar ? `${mNow.n} من ${mDays}` : `${mNow.n} of ${mDays}` },
    tiles: tilesFor(days, bills, mFrom, last, ar),
  };

  // ---- Year: month by month, from the first month with a close this year.
  const firstThisYear = [...days.keys()].filter((k) => k.startsWith(`${ly}-`)).sort()[0] ?? last;
  const fm = Number(firstThisYear.slice(5, 7)) - 1;
  const yBars: HBar[] = [];
  const fullMonths: number[] = [];
  for (let m = fm; m <= lm; m++) {
    const from = iso(ly, m, 1);
    const to = m === lm ? last : iso(ly, m, dim(ly, m));
    const s = sumRange(days, from, to);
    const isCurrent = m === lm && running;
    const bar: HBar = { key: `${ly}-${m + 1}`, axis: mon3(m, ar), full: isCurrent ? (ar ? `${MONTHS_AR[m]} حتى الآن` : `${MONTHS[m]} so far`) : ar ? `${MONTHS_AR[m]} ${ly}` : `${MONTHS[m]} ${ly}`, value: s.sales, kind: isCurrent ? "partial" : "closed" };
    if (isCurrent && projected != null) bar.projected = projected;
    // A month counts as "full" for the average only when it started on the 1st (not the first, partial month of data).
    if (!isCurrent && !(m === fm && firstThisYear.slice(8, 10) !== "01")) fullMonths.push(s.sales);
    yBars.push(bar);
  }
  const yTotal = sumRange(days, iso(ly, 0, 1), last).sales;
  const yAvg = fullMonths.length ? fullMonths.reduce((a, x) => a + x, 0) / fullMonths.length : 0;
  const best = yBars.filter((b) => b.kind === "closed").sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  const year: Period = {
    key: "year",
    tab: ar ? "سنة" : "Year",
    title: ar ? `${ly} حتى الآن` : `${ly} so far`,
    range: ar ? `منذ ${dayFull(firstThisYear, ar)}` : `Since ${dayFull(firstThisYear, ar).slice(4)}`,
    total: yTotal,
    change: null,
    bars: yBars,
    selected: yBars.length - 1,
    avg: yAvg,
    left: yAvg > 0 ? { label: ar ? "المتوسط الشهري" : "Monthly average", value: `AED ${fmt0(yAvg)}` } : null,
    right: best ? { label: ar ? "أفضل شهر" : "Best month", value: best.full.split(" ")[0] } : null,
    tiles: tilesFor(days, bills, iso(ly, 0, 1), last, ar),
  };

  return { week, month, year };
}
