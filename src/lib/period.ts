/**
 * One period picker for Sales, Orders and Recipes: Day · Week · Month · Pick dates.
 * URL: ?p=day|week|month|custom&d=YYYY-MM-DD (the day the arrows move from) or &from=&to= for picked dates.
 * Pure date maths on "YYYY-MM-DD" strings (UTC midnight), so the server's timezone never matters.
 * Safe to import from server and client code.
 */

export type Grain = "day" | "week" | "month" | "custom";
export type PeriodLocale = "en" | "ar";
export type SearchParams = Record<string, string | string[] | undefined>;

export const GRAINS: Grain[] = ["day", "week", "month", "custom"];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WDL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WD_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIso(s: unknown): s is string {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const toD = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(x: string, n: number): string {
  const d = toD(x);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export function nDays(a: string, b: string): number {
  return Math.round((toD(b).getTime() - toD(a).getTime()) / 86400000) + 1;
}
/** Monday of the week (weeks run Monday to Sunday). */
export function monday(x: string): string {
  return addDays(x, -((toD(x).getUTCDay() + 6) % 7));
}
export const monthStart = (x: string) => `${x.slice(0, 8)}01`;
export function monthEnd(x: string): string {
  const d = toD(monthStart(x));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return iso(d);
}
export function addMonths(x: string, n: number): string {
  const d = toD(monthStart(x));
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d);
}
export const weekday = (x: string) => toD(x).getUTCDay();
/** Monday = 0 … Sunday = 6 */
export const weekdayMon = (x: string) => (toD(x).getUTCDay() + 6) % 7;

export function dayMonth(x: string, locale: PeriodLocale): string {
  const d = toD(x);
  return `${d.getUTCDate()} ${locale === "ar" ? MON_AR[d.getUTCMonth()] : MON[d.getUTCMonth()]}`;
}
/** "Tue 6 Oct" / "الثلاثاء 6 أكتوبر" */
export function dayShort(x: string, locale: PeriodLocale): string {
  const d = toD(x);
  return locale === "ar" ? `${WD_AR[d.getUTCDay()]} ${dayMonth(x, locale)}` : `${WD[d.getUTCDay()]} ${dayMonth(x, locale)}`;
}
/** "Tuesday 6 Oct" / "الثلاثاء 6 أكتوبر" */
export function dayLong(x: string, locale: PeriodLocale): string {
  const d = toD(x);
  return locale === "ar" ? `${WD_AR[d.getUTCDay()]} ${dayMonth(x, locale)}` : `${WDL[d.getUTCDay()]} ${dayMonth(x, locale)}`;
}
export function monthLabel(x: string, locale: PeriodLocale): string {
  const d = toD(x);
  return `${locale === "ar" ? MON_AR[d.getUTCMonth()] : MONL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function monthShort(x: string, locale: PeriodLocale): string {
  const d = toD(x);
  return locale === "ar" ? MON_AR[d.getUTCMonth()] : MON[d.getUTCMonth()];
}
/** "5 – 11 Oct", "28 Sep – 4 Oct" */
export function rangeLabel(from: string, to: string, locale: PeriodLocale): string {
  if (from === to) return dayMonth(from, locale);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const a = sameMonth ? String(toD(from).getUTCDate()) : dayMonth(from, locale);
  const yr = from.slice(0, 4) !== to.slice(0, 4) ? ` ${to.slice(0, 4)}` : "";
  return `${a} – ${dayMonth(to, locale)}${yr}`;
}
export function weekdayShort(i: number, locale: PeriodLocale): string {
  // i: Monday = 0
  const k = (i + 1) % 7;
  return locale === "ar" ? WD_AR[k] : WD[k];
}

export function daysWord(n: number, locale: PeriodLocale): string {
  if (locale === "ar") return n === 1 ? "يوم واحد" : n === 2 ? "يومان" : n <= 10 ? `${n} أيام` : `${n} يوماً`;
  return `${n} ${n === 1 ? "day" : "days"}`;
}

export type Period = {
  grain: Grain;
  /** First and last day of the period (to can be after today for this week / this month). */
  from: string;
  to: string;
  /** Last day that counts: min(to, today). */
  end: string;
  /** Day the arrows move from. */
  anchor: string;
  /** Days from `from` to `end`. */
  days: number;
  label: string;
  tag: string;
  /** Range to compare with (same length, just before) and how to say it. */
  prev: { from: string; to: string };
  prevWord: string;
  /** Anchors for ‹ and › (null when there is nothing on that side). */
  back: string | null;
  fwd: string | null;
  includesToday: boolean;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function resolvePeriod(
  sp: SearchParams,
  o: { today: string; first?: string | null; defaultGrain: Grain; defaultAnchor?: string; locale: PeriodLocale },
): Period {
  const ar = o.locale === "ar";
  const today = o.today;
  const first = o.first && isIso(o.first) ? o.first : null;
  const p = one(sp.p);
  const grain: Grain = GRAINS.includes(p as Grain) ? (p as Grain) : o.defaultGrain;
  const dParam = one(sp.d);
  let anchor = isIso(dParam) ? dParam : o.defaultAnchor && isIso(o.defaultAnchor) ? o.defaultAnchor : today;
  if (anchor > today) anchor = today;

  let from: string;
  let to: string;
  let label: string;
  let tag = "";
  let prev: { from: string; to: string };
  let prevWord: string;

  if (grain === "custom") {
    let f = one(sp.from);
    let t = one(sp.to);
    if (!isIso(f) && !isIso(t)) {
      t = anchor;
      f = addDays(anchor, -6);
    } else if (!isIso(f)) f = t as string;
    else if (!isIso(t)) t = f;
    if ((f as string) > (t as string)) [f, t] = [t, f];
    from = f as string;
    to = (t as string) > today ? today : (t as string);
    if (from > to) from = to;
    if (nDays(from, to) > 731) from = addDays(to, -730);
    anchor = to;
    const n = nDays(from, to);
    label = rangeLabel(from, to, o.locale);
    tag = daysWord(n, o.locale);
    prev = { from: addDays(from, -n), to: addDays(from, -1) };
    prevWord = ar ? `الـ${daysWord(n, o.locale)} السابقة` : `the ${n} days before`;
  } else if (grain === "day") {
    from = anchor;
    to = anchor;
    label = dayLong(anchor, o.locale);
    tag = anchor === today ? (ar ? "اليوم" : "Today") : anchor === addDays(today, -1) ? (ar ? "أمس" : "Yesterday") : "";
    prev = { from: addDays(anchor, -7), to: addDays(anchor, -7) };
    prevWord = ar ? "نفس اليوم الأسبوع الماضي" : "same day last week";
  } else if (grain === "week") {
    from = monday(anchor);
    to = addDays(from, 6);
    const partial = to > today;
    const counted = nDays(from, partial ? today : to);
    label = rangeLabel(from, to, o.locale);
    tag =
      from <= today && to >= today
        ? ar ? "هذا الأسبوع حتى الآن" : "This week, so far"
        : from === addDays(monday(today), -7)
          ? ar ? "الأسبوع الماضي" : "Last week"
          : ar ? "أسبوع" : "Week";
    prev = { from: addDays(from, -7), to: addDays(from, -7 + counted - 1) };
    prevWord = partial ? (ar ? "نفس الأيام الأسبوع الماضي" : "same days last week") : ar ? "الأسبوع الماضي" : "last week";
  } else {
    from = monthStart(anchor);
    to = monthEnd(anchor);
    const partial = to > today;
    const counted = nDays(from, partial ? today : to);
    label = monthLabel(from, o.locale);
    tag = from <= today && to >= today ? (ar ? "هذا الشهر حتى الآن" : "This month, so far") : ar ? "شهر" : "Month";
    // A whole month is compared with the whole previous month; this month so far with the same days of the last one.
    const pf = addMonths(from, -1);
    let pt = partial ? addDays(pf, counted - 1) : monthEnd(pf);
    if (pt > monthEnd(pf)) pt = monthEnd(pf);
    prev = { from: pf, to: pt };
    prevWord = partial ? (ar ? "نفس الأيام الشهر الماضي" : "same days last month") : ar ? "الشهر الماضي" : "last month";
  }

  const end = to > today ? today : to;
  const step = (dir: 1 | -1): string => {
    if (grain === "day") return addDays(anchor, dir);
    if (grain === "week") return addDays(anchor, 7 * dir);
    if (grain === "month") return addMonths(anchor, dir);
    return anchor;
  };
  let back: string | null = null;
  let fwd: string | null = null;
  if (grain !== "custom") {
    const b = step(-1);
    back = first && (grain === "day" ? b : grain === "week" ? addDays(monday(b), 6) : monthEnd(b)) < first ? null : b;
    if (to < today) {
      const f = step(1);
      fwd = f > today ? today : f;
    }
  }

  return {
    grain,
    from,
    to,
    end,
    anchor,
    days: end >= from ? nDays(from, end) : 0,
    label,
    tag,
    prev,
    prevWord,
    back,
    fwd,
    includesToday: from <= today && to >= today,
  };
}

/** Same page, same filters, some params changed (null removes one). */
export function hrefWith(path: string, sp: SearchParams, changes: Record<string, string | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = one(v);
    if (s != null && s !== "" && !(k in changes)) q.set(k, s);
  }
  for (const [k, v] of Object.entries(changes)) if (v != null && v !== "") q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export type PeriodLinks = {
  grains: { grain: Grain; label: string; href: string; active: boolean }[];
  back: string | null;
  fwd: string | null;
};

export function periodLinks(path: string, sp: SearchParams, p: Period, locale: PeriodLocale): PeriodLinks {
  const ar = locale === "ar";
  const names: Record<Grain, string> = ar
    ? { day: "يوم", week: "أسبوع", month: "شهر", custom: "اختر التواريخ" }
    : { day: "Day", week: "Week", month: "Month", custom: "Pick dates" };
  const clear = { from: null, to: null } as Record<string, string | null>;
  return {
    grains: GRAINS.map((g) => ({
      grain: g,
      label: names[g],
      active: p.grain === g,
      href:
        g === "custom"
          ? hrefWith(path, sp, { p: "custom", d: null, from: p.from, to: p.end })
          : hrefWith(path, sp, { ...clear, p: g, d: p.grain === "custom" ? p.end : p.anchor }),
    })),
    back: p.back ? hrefWith(path, sp, { ...clear, p: p.grain, d: p.back }) : null,
    fwd: p.fwd ? hrefWith(path, sp, { ...clear, p: p.grain, d: p.fwd }) : null,
  };
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let x = from; x <= to; x = addDays(x, 1)) out.push(x);
  return out;
}
