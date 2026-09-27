import "./setup";
import { renderToString } from "react-dom/server";
import { makeModel, MAN, ORDER, type FinanceData, type Plan } from "@/lib/finance/model";
import { FinancePulse } from "@/components/finance/FinancePulse";

// ---- the ORIGINAL page's maths, copied verbatim from FinanceApp.tsx (lines 111-126, 130) ----
function oldModel(st: any) {
  const OUT = ["expense","wife","bills","debt","personal","reserve"];
  const mLabel = (m: string) => m;
    const rowsOf = (m: string, s: string) => (st.months[m] && st.months[m][s]) ? st.months[m][s] : [];
    const sumChk = (m: string, s: string) => rowsOf(m, s).filter((r: any) => r.c).reduce((a: number, r: any) => a + (+r.a || 0), 0);
    const sumAll = (m: string, s: string) => rowsOf(m, s).reduce((a: number, r: any) => a + (+r.a || 0), 0);
    const planEnd = (p: any) => { const i = ORDER.indexOf(p.start); return i < 0 ? p.start : ORDER[Math.min(i + Math.max(p.count - 1, 0), ORDER.length - 1)]; };
    const instLines = (m: string) => { const out: any[] = []; const xi = ORDER.indexOf(m); st.plans.forEach((p: any, pi: number) => { const a = ORDER.indexOf(p.start), b = ORDER.indexOf(planEnd(p)); if (a >= 0 && xi >= a && xi <= b) out.push({ pi, name: p.name, group: p.group, amount: +p.monthly || 0, paid: (xi - a) < (+p.paid || 0) }); }); return out; };
    const instPaid = (m: string) => instLines(m).filter((l) => l.paid).reduce((a, l) => a + l.amount, 0);
    const instPlanned = (m: string) => instLines(m).reduce((a, l) => a + l.amount, 0);
    const debtLines = (m: string) => rowsOf(m, "debt").map((r: any, i: number) => ({ i, l: r.l, a: +r.a || 0, c: !!r.c }));
    const incomeOf = (m: string) => sumChk(m, "income");
    const outOf = (m: string) => OUT.reduce((a, s) => a + sumChk(m, s), 0) + instPaid(m);
    const series = () => { let cum = 0; return ORDER.map((m: string) => { const income = incomeOf(m), out = outOf(m), net = income - out, opening = cum; cum += net; return { m, income, out, net, opening, leftover: cum }; }); };
    const monthInfo = (m: string) => series().find((x: any) => x.m === m);
    const cafeProfit = (m: string) => { const inc = st.cafe.income_by_month[m] || 0, exp = st.cafe.expense_by_month[m] || 0; return { inc, exp, rec: st.cafe.recurring, profit: inc - exp - st.cafe.recurring }; };
    const planCalc = (p: any) => { const count = Math.max(+p.count || 0, 0), monthly = +p.monthly || 0, paid = Math.min(Math.max(+p.paid || 0, 0), count); return { count, monthly, total: monthly * count, paid: monthly * paid, remaining: monthly * (count - paid), paidCount: paid, remCount: count - paid, pct: count > 0 ? (paid / count) * 100 : 0, end: mLabel(planEnd(p)) }; };
    const paidPerson = (name: string) => name.trim() === "" ? 0 : ORDER.reduce((a: number, m: string) => a + rowsOf(m, "debt").filter((r: any) => r.c && (r.l || "").includes(name)).reduce((s: number, r: any) => s + (+r.a || 0), 0), 0);
    const plannedOut = (m: string) => ["expense","wife","bills","debt","personal","reserve"].reduce((a, s) => a + sumAll(m, s), 0) + instPlanned(m);
  const toLines = (m: string) => { const out: any[] = []; MAN.forEach((sec) => rowsOf(m, sec).forEach((r: any) => out.push({ section: sec, label: r.l, amount: +r.a || 0, checked: !!r.c }))); return out; };
  return { series, instLines, instPaid, instPlanned, plannedOut, paidPerson, planCalc, cafeProfit, toLines, sumAll, sumChk };
}

let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const NAMES = ["خالد", "عبدالله", "سالم", "محمد"];
function randomData(): FinanceData {
  const months: any = {};
  for (const m of ORDER) {
    months[m] = {};
    for (const s of MAN) months[m][s] = Array.from({ length: Math.floor(rnd() * 5) }, (_, i) => ({
      l: s === "debt" ? pick(NAMES) + (rnd() < 0.3 ? " دفعة" : "") : `${s} ${i}`,
      a: Math.round(rnd() * 900000) / 100, c: rnd() < 0.5 }));
  }
  const plans: Plan[] = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, i) => {
    const count = 1 + Math.floor(rnd() * 40), total = Math.round(rnd() * 20000000) / 100;
    return { id: "p" + i, name: "خطة " + i, group: "أخرى", total, count, start: pick(ORDER), paid: Math.floor(rnd() * (count + 3)), monthly: total / count };
  });
  const inc: any = {}, exp: any = {};
  for (const m of ORDER) { if (rnd() < 0.6) { inc[m] = rnd() * 30000; exp[m] = rnd() * 15000; } }
  return { current: pick(ORDER), order: ORDER, months, plans, people: NAMES.map((n, i) => ({ id: "x" + i, name: n, original: Math.round(rnd() * 30000) })),
           cafe: { income_by_month: inc, expense_by_month: exp, recurring: 5320, top_items: [{ item: "Milk", qty: 10, spend: 500, times: 4 }] } };
}

let checks = 0, fails = 0;
const same = (a: unknown, b: unknown, what: string) => { checks++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; if (fails < 6) console.log("MISMATCH", what, JSON.stringify(a).slice(0, 160), "vs", JSON.stringify(b).slice(0, 160)); } };
for (let run = 0; run < 200; run++) {
  const d = randomData();
  const st = { months: JSON.parse(JSON.stringify(d.months)), plans: JSON.parse(JSON.stringify(d.plans)), cafe: d.cafe };
  const o = oldModel(st), n = makeModel(d);
  same(n.series(), o.series(), "series");
  for (const m of ORDER) {
    same(n.instLines(m), o.instLines(m), "instLines " + m);
    same(n.plannedOut(m), o.plannedOut(m), "plannedOut " + m);
    same(n.toLines(m), o.toLines(m), "toLines (what a save writes) " + m);
    same(n.cafeProfit(m), o.cafeProfit(m), "cafeProfit " + m);
  }
  for (const p of d.people) same(n.paidPerson(p.name), o.paidPerson(p.name), "paidPerson");
  for (const p of d.plans) { const { end: e1, ...a } = n.planCalc(p); const { end: e2, ...b } = o.planCalc(p); same(a, b, "planCalc"); same(e1, e2, "plan end month"); }
}
console.log(`maths vs original page: ${checks} comparisons over 200 random budgets, ${fails} mismatches`);

const d = randomData();
const html = renderToString(<FinancePulse initial={d} />).replace(/<!-- -->/g, "");
const okRender = html.includes("المالية الشخصية") && html.includes("المتبقي بعد الالتزامات") && html.includes("باقي تدفعه") && !/NaN|undefined|Infinity/.test(html);
console.log(okRender ? "new page renders (overview) with no NaN/undefined" : "RENDER PROBLEM");
process.exit(fails || !okRender ? 1 : 0);
