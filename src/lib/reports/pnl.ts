/**
 * Profit & loss for /owner/reports (page + CSV).
 *
 *   Sales        confirmed barista closings (grand_total, VAT included)
 *   Net sales    sales / (1 + the location's VAT rate)
 *   Bills        confirmed expenses before VAT (subtotal), grouped by category name:
 *                food and drink · packaging · rent and salaries billed · cleaning and other
 *   Gross profit net sales − bills
 *   Recurring    active fixed_costs as a monthly amount (monthly + quarterly/3 + annual/12),
 *                charged by the day: each calendar month's amount × (days of that month
 *                counted ÷ days in that month). Days count from the first confirmed closing
 *                (when the data starts) up to today if today is closed, else yesterday.
 *   Net profit   gross profit − recurring
 *
 * Dates are 'YYYY-MM-DD' strings in Dubai time. Date maths runs in UTC on
 * 'YYYY-MM-DDT00:00:00Z', so the server's timezone never shifts a day.
 * Everything above the loaders is pure (no database) so it can be tested on its own.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { todayDubai } from "@/lib/dates";

export type PnlLocale = "en" | "ar";

// ------------------------------------------------------------------ dates

const DAY_MS = 86_400_000;
const utcMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** A real calendar date written as YYYY-MM-DD (2026-02-30 is rejected). */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = utcMs(s);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** YYYY-MM with a month from 01 to 12. */
export function isMonthKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function addDays(iso: string, n: number): string {
  return new Date(utcMs(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to`, both included; 0 when `to` is before `from`. */
export function daysInclusive(from: string, to: string): number {
  return to < from ? 0 : Math.round((utcMs(to) - utcMs(from)) / DAY_MS) + 1;
}

export const monthOf = (iso: string) => iso.slice(0, 7);
export const monthStart = (month: string) => `${month}-01`;

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const monthEnd = (month: string) => `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

const minIso = (a: string, b: string) => (a < b ? a : b);
const maxIso = (a: string, b: string) => (a > b ? a : b);

// ------------------------------------------------------------------ labels and numbers

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** "September" / "Sep" / "سبتمبر" (Arabic month names have no short form). */
export function monthName(month: string, locale: PnlLocale, short = false): string {
  const i = Number(month.slice(5, 7)) - 1;
  if (locale === "ar") return MONTHS_AR[i] ?? month;
  const name = MONTHS_EN[i] ?? month;
  return short ? name.slice(0, 3) : name;
}

/** "September 2026" / "سبتمبر 2026" */
export const monthLabel = (month: string, locale: PnlLocale) => `${monthName(month, locale)} ${month.slice(0, 4)}`;

/** "8 Sep" / "8 سبتمبر", with the year when asked. */
export function dayLabel(iso: string, locale: PnlLocale, withYear = false): string {
  return `${Number(iso.slice(8, 10))} ${monthName(monthOf(iso), locale, true)}${withYear ? ` ${iso.slice(0, 4)}` : ""}`;
}

/** "1–5 Oct", "8 Sep – 5 Oct 2026"; Arabic: "من 1 إلى 5 أكتوبر" (reads right in RTL). */
export function rangeLabel(from: string, to: string, locale: PnlLocale, withYear = false): string {
  if (from === to) return dayLabel(from, locale, withYear);
  const sameMonth = monthOf(from) === monthOf(to);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = sameMonth ? String(Number(from.slice(8, 10))) : dayLabel(from, locale, withYear && !sameYear);
  const end = dayLabel(to, locale, withYear);
  return locale === "ar" ? `من ${start} إلى ${end}` : sameMonth ? `${start}–${end}` : `${start} – ${end}`;
}

/** Whole dirhams with Latin digits: 1,234 (never "-0"). */
export function fmtAed(n: number): string {
  return (Math.round(n) || 0).toLocaleString("en-US");
}

/** Signed whole dirhams with a real minus sign: −2,996 / +1,234 (plus only when asked). */
export function fmtSigned(n: number, plus = false): string {
  const v = Math.round(n) || 0;
  if (v < 0) return `−${(-v).toLocaleString("en-US")}`;
  return `${plus && v > 0 ? "+" : ""}${v.toLocaleString("en-US")}`;
}

/** 0.0897 → "9.0%"; null → "—". */
export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return "—";
  const v = x * 100;
  const s = (Math.abs(v) < 0.5 * 10 ** -digits ? 0 : Math.abs(v)).toFixed(digits);
  return `${v < 0 && Number(s) !== 0 ? "−" : ""}${s}%`;
}

/** 0.05 → "5%". */
export const vatLabel = (rate: number) => `${Number((rate * 100).toFixed(2))}%`;

export function daysText(n: number, locale: PnlLocale): string {
  if (locale !== "ar") return `${n} day${n === 1 ? "" : "s"}`;
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

export function staffText(n: number, locale: PnlLocale): string {
  if (locale !== "ar") return `${n} staff`;
  if (n === 1) return "موظف واحد";
  if (n === 2) return "موظفان";
  if (n >= 3 && n <= 10) return `${n} موظفين`;
  return `${n} موظفاً`;
}

export function billsText(n: number, locale: PnlLocale): string {
  if (locale !== "ar") return `${n} bill${n === 1 ? "" : "s"}`;
  if (n === 1) return "فاتورة واحدة";
  if (n === 2) return "فاتورتان";
  if (n >= 3 && n <= 10) return `${n} فواتير`;
  return `${n} فاتورة`;
}

// ------------------------------------------------------------------ bill categories

export type PnlGroup = "food" | "packaging" | "overhead" | "other";

const hasAny = (s: string, words: string[]) => words.some((w) => s.includes(w));

/**
 * Which P&L line a bill category belongs to, from its name (Arabic today, maybe English later).
 *   overhead  rent / salaries billed (normally recurring costs)
 *   packaging packaging, cups
 *   food      beverage ingredients, goods for resale, bakery, food
 *   other     cleaning, utilities, maintenance, equipment, software, "other", uncategorized
 * Names that clearly say equipment, maintenance, cleaning, utilities or software stay in
 * "other" even when they also mention coffee or drinks ("Coffee machine maintenance").
 */
export function pnlGroup(name: string | null | undefined): PnlGroup {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return "other";
  if (hasAny(n, ["إيجار", "ايجار", "رواتب", "راتب", "أجور"]) || /\b(rent|salary|salaries|wages|payroll)\b/.test(n)) return "overhead";
  if (hasAny(n, ["صيانة", "معدات", "نظافة", "تنظيف", "برامج", "كهرباء", "الخدمات"]) || /(maintenance|repair|equipment|cleaning|software|utilit|electric)/.test(n)) return "other";
  if (hasAny(n, ["تغليف"]) || /(packag|\bcups?\b|\blids?\b)/.test(n)) return "packaging";
  if (hasAny(n, ["مشروب", "مخبوز", "بضائع"]) || /(beverage|ingredient|food|resale|bakery|coffee|milk)/.test(n)) return "food";
  return "other";
}

/**
 * An electricity / water bill, judged by category or supplier name. Plain "water" alone is not
 * enough (Al Ain Water is a bottled-water brand), so English needs electricity or a utility company.
 */
export function isUtilityName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (hasAny(n, ["كهرباء", "الخدمات", "العين للتوزيع", "أبوظبي للتوزيع", "ابوظبي للتوزيع"])) return true;
  if (n.split(/[\s/\\\-،,()&+]+/).some((w) => ["ماء", "وماء", "الماء", "والماء", "مياه", "المياه", "والمياه"].includes(w))) return true;
  return /(utilit|electric|\bdewa\b|\baddc\b|\baadc\b|\bsewa\b|\bfewa\b|\btaqa\b|distribution co)/.test(n);
}

// ------------------------------------------------------------------ recurring costs

export type FixedCost = { name: string; kind: string; amount: number; frequency: string };

/** monthly + quarterly/3 + annual/12; one-time costs are not recurring. */
export function monthlyAmount(f: FixedCost): number {
  const a = Number(f.amount) || 0;
  if (f.frequency === "monthly") return a;
  if (f.frequency === "quarterly") return a / 3;
  if (f.frequency === "annual") return a / 12;
  return 0;
}

export type CountedDays = { start: string; end: string };

/**
 * The days inside [from, to] that carry recurring costs: not before the data starts
 * (first confirmed closing) and not after `asOf` (the last day that can have sales).
 */
export function costWindow(from: string, to: string, firstClosing: string | null, asOf: string): CountedDays | null {
  if (!firstClosing) return null;
  const start = maxIso(from, firstClosing);
  const end = minIso(to, asOf);
  return start <= end ? { start, end } : null;
}

export type MonthSlice = { month: string; start: string; end: string; days: number; dim: number };

/** One slice per calendar month the counted days touch. */
export function monthSlices(w: CountedDays | null): MonthSlice[] {
  if (!w) return [];
  const out: MonthSlice[] = [];
  for (let m = monthOf(w.start); m <= monthOf(w.end); m = addMonths(m, 1)) {
    const start = maxIso(w.start, monthStart(m));
    const end = minIso(w.end, monthEnd(m));
    out.push({ month: m, start, end, days: daysInclusive(start, end), dim: daysInMonth(m) });
  }
  return out;
}

export type RecurringLine = {
  key: string;
  kind: "salary" | "rent" | "item";
  /** English label (the page localizes salary and rent). */
  label: string;
  /** Amount for one full month. */
  monthly: number;
  /** Amount charged to the period. */
  amount: number;
  staff?: number;
};

/**
 * Recurring lines for a period worth `months` months (Σ days ÷ days-in-month):
 * Salaries (all salary costs, with a staff count), Rent, then every other active cost by its name.
 * Biggest first.
 */
export function recurringLines(fixed: FixedCost[], months: number): { lines: RecurringLine[]; monthly: number; total: number } {
  let salary = 0;
  let staff = 0;
  let rent = 0;
  const items = new Map<string, { label: string; monthly: number }>();
  for (const f of fixed) {
    const m = monthlyAmount(f);
    if (!m) continue;
    if (f.kind === "salary") {
      salary += m;
      staff += 1;
    } else if (f.kind === "rent") {
      rent += m;
    } else {
      const label = f.name?.trim() || "Other";
      const key = label.toLowerCase();
      const cur = items.get(key) ?? { label, monthly: 0 };
      cur.monthly += m;
      items.set(key, cur);
    }
  }
  const lines: RecurringLine[] = [];
  if (salary) lines.push({ key: "salaries", kind: "salary", label: `Salaries (${staff} staff)`, monthly: salary, amount: salary * months, staff });
  if (rent) lines.push({ key: "rent", kind: "rent", label: "Rent", monthly: rent, amount: rent * months });
  for (const [key, v] of items) lines.push({ key: `item:${key}`, kind: "item", label: v.label, monthly: v.monthly, amount: v.monthly * months });
  lines.sort((a, b) => b.monthly - a.monthly);
  const monthly = lines.reduce((s, l) => s + l.monthly, 0);
  return { lines, monthly, total: monthly * months };
}

// ------------------------------------------------------------------ the statement

export type ClosingIn = {
  closing_date: string;
  grand_total: number;
  online_total: number;
  talabat_total: number;
  keeta_total: number;
  beanz_total: number;
};

export type BillIn = {
  expense_date: string;
  /** Before VAT. */
  subtotal: number;
  vat_amount: number;
  total: number;
  category: string | null;
  parent_category?: string | null;
  supplier?: string | null;
};

export type PosDayIn = { business_date: string; net_sales: number; net_with_recipe: number; recipe_cost: number };

export type PnlInput = {
  from: string;
  to: string;
  vatRate: number;
  closings: ClosingIn[];
  bills: BillIn[];
  fixed: FixedCost[];
  /** First confirmed closing ever: recurring costs start here. */
  firstClosing: string | null;
  /** Last day that counts: today when today is closed, else yesterday. */
  asOf: string;
  /** v_pos_daily rows; null when not loaded. */
  pos?: PosDayIn[] | null;
};

export type CategoryTotal = { name: string | null; group: PnlGroup; amount: number; count: number };

export type Pnl = {
  from: string;
  to: string;
  /** Days that carry recurring costs (null = none). */
  counted: CountedDays | null;
  daysCovered: number;
  daysInPeriod: number;
  /** Days with a confirmed closing. */
  closingDays: number;
  sales: number;
  vatRate: number;
  vat: number;
  net: number;
  purchases: {
    food: number;
    packaging: number;
    overhead: number;
    other: number;
    total: number;
    count: number;
    byCategory: CategoryTotal[];
  };
  gross: number;
  grossPct: number | null;
  recurring: { lines: RecurringLine[]; total: number; monthly: number; months: MonthSlice[] };
  netProfit: number;
  netPct: number | null;
  apps: { total: number; talabat: number; keeta: number; beanz: number; unsplit: number; share: number | null };
  /** Food and drink bills ÷ net sales. */
  foodCostBills: number | null;
  /** Recipe cost of what the POS sold ÷ those sales before VAT; null = no POS reports in the period. */
  foodCostRecipes: { pct: number | null; coverage: number | null; days: number } | null;
  utilityBills: number;
  /** An active recurring cost already covers electricity / water. */
  utilityRecurring: boolean;
};

/** Before-VAT amount of a bill; falls back to total − VAT when the subtotal was never filled. */
export function exVat(b: Pick<BillIn, "subtotal" | "vat_amount" | "total">): number {
  return b.subtotal !== 0 ? b.subtotal : b.total - b.vat_amount;
}

export function billGroup(b: Pick<BillIn, "category" | "parent_category">): PnlGroup {
  const g = pnlGroup(b.category);
  return g === "other" && b.parent_category ? pnlGroup(b.parent_category) : g;
}

export function computePnl(i: PnlInput): Pnl {
  const inRange = (d: string) => d >= i.from && d <= i.to;
  const rate = i.vatRate;

  let sales = 0;
  let online = 0;
  let talabat = 0;
  let keeta = 0;
  let beanz = 0;
  const closed = new Set<string>();
  for (const c of i.closings) {
    if (!inRange(c.closing_date)) continue;
    sales += c.grand_total;
    online += c.online_total;
    talabat += c.talabat_total;
    keeta += c.keeta_total;
    beanz += c.beanz_total;
    closed.add(c.closing_date);
  }
  const net = sales / (1 + rate);
  const vat = sales - net;
  const ofNet = (x: number) => (net > 0 ? x / net : null);

  const sums: Record<PnlGroup, number> = { food: 0, packaging: 0, overhead: 0, other: 0 };
  const cats = new Map<string, CategoryTotal>();
  let count = 0;
  let utilityBills = 0;
  for (const b of i.bills) {
    if (!inRange(b.expense_date)) continue;
    const amount = exVat(b);
    const group = billGroup(b);
    sums[group] += amount;
    count += 1;
    if (isUtilityName(b.category) || isUtilityName(b.parent_category) || isUtilityName(b.supplier)) utilityBills += 1;
    const name = b.category?.trim() || null;
    const key = name ?? "\u0000";
    const cur = cats.get(key) ?? { name, group, amount: 0, count: 0 };
    cur.amount += amount;
    cur.count += 1;
    cats.set(key, cur);
  }
  const purchasesTotal = sums.food + sums.packaging + sums.overhead + sums.other;
  const gross = net - purchasesTotal;

  const counted = costWindow(i.from, i.to, i.firstClosing, i.asOf);
  const months = monthSlices(counted);
  const factor = months.reduce((s, m) => s + m.days / m.dim, 0);
  const rec = recurringLines(i.fixed, factor);
  const netProfit = gross - rec.total;

  let foodCostRecipes: Pnl["foodCostRecipes"] = null;
  const pos = (i.pos ?? []).filter((r) => inRange(r.business_date));
  if (pos.length) {
    const netSales = pos.reduce((s, r) => s + r.net_sales, 0);
    const withRecipe = pos.reduce((s, r) => s + r.net_with_recipe, 0);
    const cost = pos.reduce((s, r) => s + r.recipe_cost, 0);
    foodCostRecipes = {
      pct: withRecipe > 0 ? cost / (withRecipe / (1 + rate)) : null,
      coverage: netSales > 0 ? withRecipe / netSales : null,
      days: pos.length,
    };
  }

  return {
    from: i.from,
    to: i.to,
    counted,
    daysCovered: counted ? daysInclusive(counted.start, counted.end) : 0,
    daysInPeriod: daysInclusive(i.from, i.to),
    closingDays: closed.size,
    sales,
    vatRate: rate,
    vat,
    net,
    purchases: {
      ...sums,
      total: purchasesTotal,
      count,
      byCategory: [...cats.values()].sort((a, b) => b.amount - a.amount),
    },
    gross,
    grossPct: ofNet(gross),
    recurring: { lines: rec.lines, total: rec.total, monthly: rec.monthly, months },
    netProfit,
    netPct: ofNet(netProfit),
    apps: {
      total: online,
      talabat,
      keeta,
      beanz,
      unsplit: Math.max(0, online - talabat - keeta - beanz),
      share: sales > 0 ? online / sales : null,
    },
    foodCostBills: ofNet(sums.food),
    foodCostRecipes,
    utilityBills,
    utilityRecurring: i.fixed.some((f) => monthlyAmount(f) > 0 && (f.kind === "utility" || isUtilityName(f.name))),
  };
}

export type StatementLine = {
  key: string;
  label: string;
  /** Costs are negative. */
  amount: number;
  /** Share of net sales (positive for costs too). */
  pct: number | null;
  kind: "line" | "total" | "result";
  note?: string;
};

/** The statement, top to bottom, as the page and the CSV show it. */
export function statementLines(p: Pnl, locale: PnlLocale = "en"): StatementLine[] {
  const ar = locale === "ar";
  const ofNet = (x: number) => (p.net > 0 ? x / p.net : null);
  const out: StatementLine[] = [
    { key: "sales", label: ar ? "المبيعات شاملة الضريبة" : "Sales with VAT", amount: p.sales, pct: null, kind: "line" },
    { key: "vat", label: ar ? `ضريبة القيمة المضافة ${vatLabel(p.vatRate)}` : `VAT ${vatLabel(p.vatRate)}`, amount: -p.vat, pct: null, kind: "line" },
    { key: "net", label: ar ? "صافي المبيعات" : "Net sales", amount: p.net, pct: p.net > 0 ? 1 : null, kind: "total" },
    { key: "food", label: ar ? "مشتريات الطعام والمشروبات" : "Food and drink bought", amount: -p.purchases.food, pct: ofNet(p.purchases.food), kind: "line" },
    { key: "packaging", label: ar ? "التغليف" : "Packaging", amount: -p.purchases.packaging, pct: ofNet(p.purchases.packaging), kind: "line" },
    { key: "other", label: ar ? "النظافة ومصاريف أخرى" : "Cleaning and other", amount: -p.purchases.other, pct: ofNet(p.purchases.other), kind: "line" },
  ];
  if (Math.abs(p.purchases.overhead) >= 0.005) {
    out.push({
      key: "overhead",
      label: ar ? "إيجار ورواتب مسجّلة كفواتير" : "Rent and salaries billed",
      amount: -p.purchases.overhead,
      pct: ofNet(p.purchases.overhead),
      kind: "line",
      note: ar
        ? "عادةً تُحسب أيضاً ضمن المصاريف الثابتة — تأكد أنها غير مكررة."
        : "Usually in recurring costs too — check they aren't counted twice.",
    });
  }
  out.push({ key: "gross", label: ar ? "الربح الإجمالي" : "Gross profit", amount: p.gross, pct: p.grossPct, kind: "total" });
  for (const r of p.recurring.lines) {
    if (Math.abs(r.amount) < 0.005) continue;
    const label =
      r.kind === "salary"
        ? ar
          ? `الرواتب · ${staffText(r.staff ?? 0, "ar")}`
          : `Salaries · ${staffText(r.staff ?? 0, "en")}`
        : r.kind === "rent"
          ? ar
            ? "الإيجار"
            : "Rent"
          : r.label;
    out.push({ key: `rec:${r.key}`, label, amount: -r.amount, pct: ofNet(r.amount), kind: "line" });
  }
  out.push({ key: "profit", label: ar ? "صافي الربح" : "Net profit", amount: p.netProfit, pct: p.netPct, kind: "result" });
  return out;
}

export function groupLabel(g: PnlGroup, locale: PnlLocale = "en"): string {
  const ar = locale === "ar";
  if (g === "food") return ar ? "طعام ومشروبات" : "Food and drink";
  if (g === "packaging") return ar ? "تغليف" : "Packaging";
  if (g === "overhead") return ar ? "إيجار ورواتب" : "Rent and salaries";
  return ar ? "نظافة وأخرى" : "Cleaning and other";
}

// ------------------------------------------------------------------ months

export type TrendRow = {
  month: string;
  /** "Sep 2026" */
  label: string;
  sales: number;
  net: number;
  gross: number;
  recurring: number;
  profit: number;
  /** Fewer days counted than the month has (this month so far, or the month the data starts). */
  partial: boolean;
  daysCovered: number;
  daysInMonth: number;
  hasData: boolean;
};

export function computeTrend(
  i: Omit<PnlInput, "from" | "to" | "pos"> & { endMonth: string; months: number },
): TrendRow[] {
  const rows: TrendRow[] = [];
  for (let k = Math.max(1, i.months) - 1; k >= 0; k--) {
    const month = addMonths(i.endMonth, -k);
    const p = computePnl({ ...i, from: monthStart(month), to: monthEnd(month), pos: null });
    rows.push({
      month,
      label: `${monthName(month, "en", true)} ${month.slice(0, 4)}`,
      sales: p.sales,
      net: p.net,
      gross: p.gross,
      recurring: p.recurring.total,
      profit: p.netProfit,
      partial: p.daysCovered > 0 && p.daysCovered < p.daysInPeriod,
      daysCovered: p.daysCovered,
      daysInMonth: p.daysInPeriod,
      hasData: p.daysCovered > 0 || p.closingDays > 0 || p.purchases.count > 0,
    });
  }
  return rows;
}

// ------------------------------------------------------------------ period from the URL

export type PnlPeriod = { kind: "month" | "range"; month: string | null; from: string; to: string };

/**
 * `from` + `to` (custom range) win over `m=YYYY-MM`. Default month: last month during the
 * first 10 days of a month, else this month to date. Future months fall back to this month.
 */
export function resolvePeriod(
  params: { m?: string | null; from?: string | null; to?: string | null },
  today: string,
): PnlPeriod {
  const cur = monthOf(today);
  if (isIsoDate(params.from) && isIsoDate(params.to)) {
    const [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    const m = monthOf(from);
    if (from === monthStart(m) && to === monthEnd(m)) return { kind: "month", month: m, from, to };
    return { kind: "range", month: null, from, to };
  }
  let m = isMonthKey(params.m) ? params.m : Number(today.slice(8, 10)) <= 10 ? addMonths(cur, -1) : cur;
  if (m > cur) m = cur;
  return { kind: "month", month: m, from: monthStart(m), to: monthEnd(m) };
}

// ------------------------------------------------------------------ loaders

const PAGE = 1000;
type PageResult = { data: unknown[] | null; error: { message: string } | null };

/** Supabase returns at most 1000 rows per request: read page after page. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 500; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
  return out;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** VAT rate of the main location (0.05 when it can't be read). */
export async function fetchVatRate(): Promise<number> {
  const db = createServiceClient();
  const { data, error } = await db.from("locations").select("vat_rate").eq("slug", "qave_main").maybeSingle();
  const r = Number((data as { vat_rate?: unknown } | null)?.vat_rate);
  return !error && data && Number.isFinite(r) && r >= 0 && r < 1 ? r : 0.05;
}

export type PnlContext = {
  today: string;
  /** Last day that counts: today when today has a confirmed closing, else yesterday. */
  asOf: string;
  vatRate: number;
  firstClosing: string | null;
  /** First POS daily report (null when there are none). */
  firstPosDay: string | null;
  fixed: FixedCost[];
  categories: Map<string, { name: string; parentId: string | null }>;
};

/** What every P&L read shares: VAT rate, data start, recurring costs, category names. */
export async function loadPnlContext(): Promise<PnlContext> {
  const db = createServiceClient();
  const today = todayDubai();
  const [vatRate, firstRes, todayRes, posRes, fixed, cats] = await Promise.all([
    fetchVatRate(),
    db.from("closings").select("closing_date").eq("status", "confirmed").order("closing_date", { ascending: true }).limit(1),
    db.from("closings").select("closing_date").eq("status", "confirmed").eq("closing_date", today).limit(1),
    db.from("pos_daily_reports").select("business_date").order("business_date", { ascending: true }).limit(1),
    fetchAll<Record<string, unknown>>((a, b) =>
      db.from("fixed_costs").select("id, name, kind, amount, frequency").eq("is_active", true).order("id").range(a, b),
    ),
    fetchAll<Record<string, unknown>>((a, b) => db.from("categories").select("id, name, parent_id").order("id").range(a, b)),
  ]);
  if (firstRes.error) throw new Error(firstRes.error.message);
  if (todayRes.error) throw new Error(todayRes.error.message);
  const first = (firstRes.data ?? [])[0] as { closing_date?: string } | undefined;
  const firstPos = posRes.error ? undefined : ((posRes.data ?? [])[0] as { business_date?: string } | undefined);
  return {
    today,
    asOf: (todayRes.data ?? []).length ? today : addDays(today, -1),
    vatRate,
    firstClosing: first?.closing_date ?? null,
    firstPosDay: firstPos?.business_date ?? null,
    fixed: fixed.map((f) => ({
      name: String(f.name ?? ""),
      kind: String(f.kind ?? "other"),
      amount: num(f.amount),
      frequency: String(f.frequency ?? "monthly"),
    })),
    categories: new Map(
      cats.map((c) => [String(c.id), { name: String(c.name ?? ""), parentId: c.parent_id ? String(c.parent_id) : null }]),
    ),
  };
}

async function fetchClosings(from: string, to: string): Promise<ClosingIn[]> {
  const db = createServiceClient();
  const rows = await fetchAll<Record<string, unknown>>((a, b) =>
    db
      .from("closings")
      .select("id, closing_date, grand_total, online_total, talabat_total, keeta_total, beanz_total")
      .eq("status", "confirmed")
      .gte("closing_date", from)
      .lte("closing_date", to)
      .order("closing_date")
      .order("id")
      .range(a, b),
  );
  return rows.map((r) => ({
    closing_date: String(r.closing_date),
    grand_total: num(r.grand_total),
    online_total: num(r.online_total),
    talabat_total: num(r.talabat_total),
    keeta_total: num(r.keeta_total),
    beanz_total: num(r.beanz_total),
  }));
}

async function fetchBills(from: string, to: string, ctx: PnlContext): Promise<BillIn[]> {
  const db = createServiceClient();
  const rows = await fetchAll<Record<string, unknown>>((a, b) =>
    db
      .from("expenses")
      .select("id, expense_date, subtotal, vat_amount, total, category_id, suppliers(name)")
      .eq("status", "confirmed")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date")
      .order("id")
      .range(a, b),
  );
  return rows.map((r) => {
    const cat = r.category_id ? ctx.categories.get(String(r.category_id)) : undefined;
    const parent = cat?.parentId ? ctx.categories.get(cat.parentId) : undefined;
    const sup = r.suppliers as { name?: string } | { name?: string }[] | null;
    return {
      expense_date: String(r.expense_date),
      subtotal: num(r.subtotal),
      vat_amount: num(r.vat_amount),
      total: num(r.total),
      category: cat?.name ?? null,
      parent_category: parent?.name ?? null,
      supplier: (Array.isArray(sup) ? sup[0]?.name : sup?.name) ?? null,
    };
  });
}

/** POS days with recipe costs; null when the POS view can't be read (never breaks the page). */
async function fetchPosDays(from: string, to: string): Promise<PosDayIn[] | null> {
  const db = createServiceClient();
  try {
    const rows = await fetchAll<Record<string, unknown>>((a, b) =>
      db
        .from("v_pos_daily")
        .select("location_id, business_date, net_sales, net_with_recipe, recipe_cost")
        .gte("business_date", from)
        .lte("business_date", to)
        .order("business_date")
        .order("location_id")
        .range(a, b),
    );
    return rows.map((r) => ({
      business_date: String(r.business_date),
      net_sales: num(r.net_sales),
      net_with_recipe: num(r.net_with_recipe),
      recipe_cost: num(r.recipe_cost),
    }));
  } catch {
    return null;
  }
}

/** The P&L for one period (dates included). */
export async function loadPnl(from: string, to: string, ctx?: PnlContext): Promise<Pnl> {
  const c = ctx ?? (await loadPnlContext());
  const [closings, bills, pos] = await Promise.all([fetchClosings(from, to), fetchBills(from, to, c), fetchPosDays(from, to)]);
  return computePnl({
    from,
    to,
    vatRate: c.vatRate,
    closings,
    bills,
    fixed: c.fixed,
    firstClosing: c.firstClosing,
    asOf: c.asOf,
    pos,
  });
}

/** One row per month for the `months` months ending with `endMonth` (YYYY-MM), oldest first. */
export async function loadMonthlyTrend(endMonth: string, months = 6, ctx?: PnlContext): Promise<TrendRow[]> {
  const c = ctx ?? (await loadPnlContext());
  const n = Math.max(1, months);
  const from = monthStart(addMonths(endMonth, -(n - 1)));
  const to = monthEnd(endMonth);
  const [closings, bills] = await Promise.all([fetchClosings(from, to), fetchBills(from, to, c)]);
  return computeTrend({
    endMonth,
    months: n,
    vatRate: c.vatRate,
    closings,
    bills,
    fixed: c.fixed,
    firstClosing: c.firstClosing,
    asOf: c.asOf,
  });
}
