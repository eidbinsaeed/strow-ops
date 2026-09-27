/**
 * Personal finance model — the exact maths of the original finance page
 * (FinanceApp), shared by the new page and the finance AI so both always
 * show the same numbers.
 */
export type SecKey = "income" | "expense" | "wife" | "bills" | "debt" | "personal" | "reserve";
export type Row = { l: string; a: number; c: boolean };
export type Sections = Record<SecKey, Row[]>;
export type Plan = { id?: string; name: string; group: string; total: number; count: number; start: string; paid: number; monthly: number };
export type Person = { id: string; name: string; original: number };
export type CafeData = {
  income_by_month: Record<string, number>;
  expense_by_month: Record<string, number>;
  recurring: number;
  top_items: { item: string; qty: number; spend: number; times: number }[];
};
export type FinanceData = { current: string; order: string[]; months: Record<string, Sections>; plans: Plan[]; people: Person[]; cafe: CafeData };
export type InstLine = { pi: number; name: string; group: string; amount: number; paid: boolean };

export const MAN: SecKey[] = ["income", "expense", "wife", "bills", "debt", "personal", "reserve"];
export const OUT: SecKey[] = ["expense", "wife", "bills", "debt", "personal", "reserve"];
export const SECT: { k: SecKey | "installment"; t: string; c: string }[] = [
  { k: "income", t: "الدخل", c: "#2F7A5B" },
  { k: "expense", t: "المصاريف", c: "#0F1C2B" },
  { k: "wife", t: "تحويل الزوجة (راعية عطوة)", c: "#7C5CC4" },
  { k: "bills", t: "الفواتير", c: "#8B93A7" },
  { k: "installment", t: "أقساط هذا الشهر", c: "#2350D0" },
  { k: "debt", t: "سداد الديون", c: "#9A1B12" },
  { k: "personal", t: "مصروفي الشخصي", c: "#C98300" },
  { k: "reserve", t: "الاحتياطي / الطوارئ", c: "#3E8E9E" },
];

const ALL: string[] = [];
for (const y of [2026, 2027, 2028]) for (let m = 1; m <= 12; m++) ALL.push(`${y}-${String(m).padStart(2, "0")}`);
/** The 24-month plan: June 2026 → May 2028 (same as the original page). */
export const ORDER = ALL.filter((k) => k >= "2026-06" && k <= "2028-05");

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const mName = (m: string) => AR_MONTHS[Number(m.slice(5, 7)) - 1] ?? m;
export const mLabel = (m: string) => `${mName(m)} ${m.slice(0, 4)}`;

export function emptySections(): Sections {
  return { income: [], expense: [], wife: [], bills: [], debt: [], personal: [], reserve: [] };
}

export function makeModel(d: { order: string[]; months: Record<string, Sections>; plans: Plan[]; cafe: CafeData }) {
  const order = d.order;
  const rowsOf = (m: string, s: SecKey): Row[] => (d.months[m] && d.months[m][s] ? d.months[m][s] : []);
  const sumChk = (m: string, s: SecKey) => rowsOf(m, s).filter((r) => r.c).reduce((a, r) => a + (+r.a || 0), 0);
  const sumAll = (m: string, s: SecKey) => rowsOf(m, s).reduce((a, r) => a + (+r.a || 0), 0);
  const planEnd = (p: Plan) => {
    const i = order.indexOf(p.start);
    return i < 0 ? p.start : order[Math.min(i + Math.max(p.count - 1, 0), order.length - 1)];
  };
  const instLines = (m: string): InstLine[] => {
    const out: InstLine[] = [];
    const xi = order.indexOf(m);
    d.plans.forEach((p, pi) => {
      const a = order.indexOf(p.start), b = order.indexOf(planEnd(p));
      if (a >= 0 && xi >= a && xi <= b) out.push({ pi, name: p.name, group: p.group, amount: +p.monthly || 0, paid: xi - a < (+p.paid || 0) });
    });
    return out;
  };
  const instPaid = (m: string) => instLines(m).filter((l) => l.paid).reduce((a, l) => a + l.amount, 0);
  const instPlanned = (m: string) => instLines(m).reduce((a, l) => a + l.amount, 0);
  const incomeOf = (m: string) => sumChk(m, "income");
  const outOf = (m: string) => OUT.reduce((a, s) => a + sumChk(m, s), 0) + instPaid(m);
  const plannedIncome = (m: string) => sumAll(m, "income");
  const plannedOut = (m: string) => OUT.reduce((a, s) => a + sumAll(m, s), 0) + instPlanned(m);
  const series = () => {
    let cum = 0;
    return order.map((m) => {
      const income = incomeOf(m), out = outOf(m), net = income - out, opening = cum;
      cum += net;
      return { m, income, out, net, opening, leftover: cum };
    });
  };
  const cafeProfit = (m: string) => {
    const inc = d.cafe.income_by_month[m] || 0, exp = d.cafe.expense_by_month[m] || 0;
    return { inc, exp, rec: d.cafe.recurring, profit: inc - exp - d.cafe.recurring };
  };
  const planCalc = (p: Plan) => {
    const count = Math.max(+p.count || 0, 0), monthly = +p.monthly || 0, paid = Math.min(Math.max(+p.paid || 0, 0), count);
    return { count, monthly, total: monthly * count, paid: monthly * paid, remaining: monthly * (count - paid), paidCount: paid, remCount: count - paid, pct: count > 0 ? (paid / count) * 100 : 0, end: planEnd(p) };
  };
  const paidPerson = (name: string) =>
    name.trim() === "" ? 0 : order.reduce((a, m) => a + rowsOf(m, "debt").filter((r) => r.c && (r.l || "").includes(name)).reduce((s, r) => s + (+r.a || 0), 0), 0);
  const toLines = (m: string) => MAN.flatMap((sec) => rowsOf(m, sec).map((r) => ({ section: sec, label: r.l, amount: +r.a || 0, checked: !!r.c })));
  return { rowsOf, sumChk, sumAll, planEnd, instLines, instPaid, instPlanned, incomeOf, outOf, plannedIncome, plannedOut, series, cafeProfit, planCalc, paidPerson, toLines };
}
