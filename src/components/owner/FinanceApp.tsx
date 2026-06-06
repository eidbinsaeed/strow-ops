"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveBudget, savePeople, saveInstallments,
  type BudgetLineInput, type PersonInput, type InstallmentInput,
} from "@/app/owner/finance/actions";

type Section = "income" | "expense" | "bills" | "installment" | "debt" | "personal" | "reserve" | "wife";
type BudgetRow = { section: Section; label: string; amount: number; checked: boolean; note: string };
type PayRow = { amount: number; paid_on: string };
type PersonRow = { name: string; original_amount: number; note: string; payments: PayRow[] };
type InstRow = { name: string; group_name: string; total: number; installments_count: number; start_month: string; paid_count: number };
type Monthly = { month: string; income: number; out: number; net: number; leftover: number };
type Initial = {
  month: string;
  opening: number;
  monthly: Monthly[];
  budget: { section: string; label: string; amount: number; checked: boolean; note: string }[];
  people: { name: string; original_amount: number; note: string; payments: { amount: number; paid_on: string }[] }[];
  installments: { name: string; group_name: string; total: number; installments_count: number; start_month: string; paid_count: number }[];
  cafe: { income: number; expenses: number; recurring: number };
};

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthLabel = (k: string) => { const [y, m] = k.split("-").map(Number); return `${AR_MONTHS[m - 1]} ${y}`; };
const shortMonth = (k: string) => AR_MONTHS[Number(k.split("-")[1]) - 1] ?? k;
const GROUPS = ["بطاقة ائتمانية", "تابي كارد", "تابي مشتريات", "تمارا", "أخرى"];
const MONTH_KEYS: string[] = [];
for (const y of [2026, 2027, 2028]) for (let m = 1; m <= 12; m++) MONTH_KEYS.push(`${y}-${String(m).padStart(2, "0")}`);

const fmt = (n: number, dec = 0) =>
  (n < 0 ? "-" : "") + "د.إ " + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const today = () => new Date().toISOString().slice(0, 10);

const inp = "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs focus:border-strow-ink focus:outline-none";
const numInp = inp + " text-left";

const SECTIONS: { key: Section; title: string; color: string }[] = [
  { key: "income", title: "الدخل", color: "bg-teal-700" },
  { key: "expense", title: "المصاريف", color: "bg-rose-900" },
  { key: "wife", title: "⭐ تفصيل تحويل الزوجة (راعية عطوة)", color: "bg-[#6f4e37]" },
  { key: "bills", title: "الفواتير", color: "bg-slate-600" },
  { key: "installment", title: "الأقساط المدفوعة هذا الشهر", color: "bg-indigo-800" },
  { key: "debt", title: "سداد الديون هذا الشهر", color: "bg-rose-700" },
  { key: "personal", title: "مصروفي الشخصي", color: "bg-amber-700" },
  { key: "reserve", title: "الاحتياطي / الطوارئ", color: "bg-emerald-700" },
];

export function FinanceApp({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "budget" | "debts" | "inst">("overview");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const [budget, setBudget] = useState<BudgetRow[]>(initial.budget.map((b) => ({ ...b, section: b.section as Section })));
  const [people, setPeople] = useState<PersonRow[]>(initial.people.map((p) => ({ ...p, payments: p.payments.map((x) => ({ ...x })) })));
  const [inst, setInst] = useState<InstRow[]>(initial.installments.map((i) => ({ ...i })));
  const [pay, setPay] = useState({ idx: "", amount: "", date: today() });

  const cafe = initial.cafe;
  const cafeProfit = cafe.income - cafe.expenses - cafe.recurring;

  // ---- per-section sums ----
  const rowsOf = (s: Section) => budget.filter((b) => b.section === s);
  const sumAll = (s: Section) => rowsOf(s).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const sumChk = (s: Section) => rowsOf(s).filter((r) => r.checked).reduce((a, r) => a + (Number(r.amount) || 0), 0);

  const wifeAll = sumAll("wife");
  const incomeChecked = sumChk("income");
  const expenseCounts = sumChk("expense") + wifeAll;
  const out = expenseCounts + sumChk("bills") + sumChk("installment") + sumChk("debt") + sumChk("personal") + sumChk("reserve");
  const net = incomeChecked - out;
  const leftover = initial.opening + net;
  const savings = incomeChecked > 0 ? (net / incomeChecked) * 100 : 0;

  // category breakdown for charts
  const breakdown = useMemo(() => {
    const cats = [
      { label: "المصاريف", amount: sumChk("expense") },
      { label: "تحويل الزوجة", amount: wifeAll },
      { label: "الفواتير", amount: sumChk("bills") },
      { label: "الأقساط", amount: sumChk("installment") },
      { label: "الديون", amount: sumChk("debt") },
      { label: "الشخصي", amount: sumChk("personal") },
      { label: "الاحتياطي", amount: sumChk("reserve") },
    ];
    const tot = cats.reduce((s, c) => s + c.amount, 0);
    return cats.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount).map((c) => ({ ...c, pct: tot > 0 ? (c.amount / tot) * 100 : 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget]);

  const trend = initial.monthly;
  const trendMax = Math.max(1, ...trend.map((m) => Math.abs(m.leftover)));

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(null), 2500); }

  // budget row helpers
  const setRow = (section: Section, i: number, patch: Partial<BudgetRow>) =>
    setBudget((rows) => { let k = -1; return rows.map((r) => { if (r.section === section) { k++; if (k === i) return { ...r, ...patch }; } return r; }); });
  const addRow = (section: Section) => setBudget((rows) => [...rows, { section, label: "", amount: 0, checked: false, note: "" }]);
  const delRow = (section: Section, i: number) => setBudget((rows) => { let k = -1; return rows.filter((r) => { if (r.section === section) { k++; return !(k === i); } return true; }); });

  function doSaveBudget() {
    const lines: BudgetLineInput[] = budget.map((b) => ({ section: b.section, label: b.label, amount: Number(b.amount) || 0, checked: b.checked, note: b.note }));
    startTransition(async () => { const r = await saveBudget(initial.month, lines); if (r.error) flash("خطأ: " + r.error); else { flash("تم حفظ شهر " + monthLabel(initial.month) + " ✓"); router.refresh(); } });
  }
  function doSavePeople() {
    const list: PersonInput[] = people.map((p) => ({ name: p.name, original_amount: Number(p.original_amount) || 0, note: p.note, payments: p.payments.map((x) => ({ amount: Number(x.amount) || 0, paid_on: x.paid_on })) }));
    startTransition(async () => { const r = await savePeople(list); if (r.error) flash("خطأ: " + r.error); else { flash("تم حفظ الديون ✓"); router.refresh(); } });
  }
  function doSaveInst() {
    const list: InstallmentInput[] = inst.map((it) => ({ name: it.name, group_name: it.group_name, total: Number(it.total) || 0, installments_count: Number(it.installments_count) || 1, start_month: it.start_month, paid_count: Number(it.paid_count) || 0 }));
    startTransition(async () => { const r = await saveInstallments(list); if (r.error) flash("خطأ: " + r.error); else { flash("تم حفظ الأقساط ✓"); router.refresh(); } });
  }

  const tabBtn = (id: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(id)}
      className={"rounded-full border px-4 py-2 text-sm transition " + (tab === id ? "border-strow-ink bg-strow-ink text-white" : "border-neutral-300 bg-white text-neutral-500")}>
      {label}
    </button>
  );

  // debts calcs
  const paidOf = (p: PersonRow) => p.payments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const debtOrig = people.reduce((s, p) => s + (Number(p.original_amount) || 0), 0);
  const debtPaid = people.reduce((s, p) => s + paidOf(p), 0);

  // installment calcs
  const instCalc = inst.map((it) => {
    const c = Math.max(Number(it.installments_count) || 0, 0);
    const t = Number(it.total) || 0;
    const pc = Math.min(Math.max(Number(it.paid_count) || 0, 0), c);
    const monthly = c > 0 ? t / c : 0;
    const si = MONTH_KEYS.indexOf(it.start_month);
    const ei = si >= 0 ? Math.min(si + Math.max(c - 1, 0), MONTH_KEYS.length - 1) : -1;
    return { monthly, paid: monthly * pc, remaining: t - monthly * pc, remCount: c - pc, pct: t > 0 ? (monthly * pc / t) * 100 : 0, endLabel: ei >= 0 ? monthLabel(MONTH_KEYS[ei]) : "—" };
  });
  const instTotal = inst.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const instPaidV = instCalc.reduce((s, c) => s + c.paid, 0);

  return (
    <div dir="rtl">
      <div className="my-3 flex flex-wrap items-center gap-2">
        {tabBtn("overview", "الملخص")}
        {tabBtn("budget", "الميزانية الشهرية")}
        {tabBtn("debts", "الديون")}
        {tabBtn("inst", "الأقساط")}
        <div className="ms-auto flex items-center gap-2">
          {msg && <span className="text-xs text-emerald-700">{msg}</span>}
          <select value={initial.month} onChange={(e) => router.push(("/owner/finance?m=" + e.target.value) as Parameters<typeof router.push>[0])}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm">
            {trend.map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>)}
          </select>
        </div>
      </div>

      {/* ===== OVERVIEW ===== */}
      {tab === "overview" && (
        <div>
          <p className="mb-3 text-xs font-semibold text-neutral-500">💡 ملخص ذكي — {monthLabel(initial.month)}</p>
          <div className="mb-4 rounded-3xl bg-gradient-to-br from-[#6f4e37] to-[#8a6a4f] p-6 text-white">
            <div className="text-sm opacity-90">الرصيد المتبقّي نهاية الشهر (يُرحّل للشهر التالي)</div>
            <div className="mt-1 text-4xl font-extrabold tabular-nums">{fmt(leftover)}</div>
            <div className="mt-1 text-sm opacity-90">الرصيد الافتتاحي {fmt(initial.opening)} · صافي الشهر {fmt(net)} · ادخار {savings.toFixed(1)}%</div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card t="الدخل المؤكد" n={fmt(incomeChecked)} cls="text-emerald-700" />
            <Card t="إجمالي الخارج" n={fmt(out)} cls="text-red-700" />
            <Card t="صافي الشهر" n={fmt(net)} cls={net < 0 ? "text-red-700" : "text-emerald-700"} />
            <Card t="☕ ربح كافيه Qave" n={fmt(cafeProfit)} cls={cafeProfit < 0 ? "text-red-700" : ""} m="مرجعي — غير محتسب" />
          </div>

          {/* expense breakdown */}
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">أين يذهب المال — {monthLabel(initial.month)}</h3>
            {breakdown.length === 0 ? <p className="text-xs text-neutral-400">لا مصاريف محتسبة بعد.</p> :
              breakdown.map((b) => (
                <div key={b.label} className="mb-2">
                  <div className="flex justify-between text-xs"><span>{b.label}</span><span className="tabular-nums text-neutral-500">{fmt(b.amount)} · {b.pct.toFixed(0)}%</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded bg-neutral-100"><div className="h-full rounded bg-rose-700" style={{ width: b.pct.toFixed(0) + "%" }} /></div>
                </div>
              ))}
          </div>

          {/* leftover trend */}
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">اتجاه الرصيد المتراكم (٢٤ شهر)</h3>
            <div className="flex h-44 items-end gap-1 overflow-x-auto">
              {trend.map((m) => {
                const h = Math.round((Math.abs(m.leftover) / trendMax) * 100);
                return (
                  <div key={m.month} className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1" title={monthLabel(m.month) + ": " + fmt(m.leftover)}>
                    <div className={"w-full rounded-t " + (m.leftover < 0 ? "bg-red-500" : (m.month === initial.month ? "bg-amber-600" : "bg-emerald-600"))} style={{ height: Math.max(h, 2) + "%" }} />
                    <div className="text-[9px] text-neutral-400">{shortMonth(m.month)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 24-month table */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <h3 className="bg-slate-700 px-4 py-3 text-sm font-medium text-white">جدول الـ٢٤ شهر</h3>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="bg-neutral-50 text-neutral-500"><th className="p-2 text-right">الشهر</th><th className="p-2 text-right">الدخل</th><th className="p-2 text-right">الخارج</th><th className="p-2 text-right">صافي الشهر</th><th className="p-2 text-right">الرصيد المتراكم</th></tr></thead>
              <tbody>{trend.map((m) => (
                <tr key={m.month} className={"border-t border-neutral-100 " + (m.month === initial.month ? "bg-amber-50" : "")}>
                  <td className="p-2"><button type="button" className="hover:underline" onClick={() => router.push(("/owner/finance?m=" + m.month) as Parameters<typeof router.push>[0])}>{monthLabel(m.month)}</button></td>
                  <td className="p-2 tabular-nums text-emerald-700">{fmt(m.income)}</td>
                  <td className="p-2 tabular-nums text-red-700">{fmt(m.out)}</td>
                  <td className={"p-2 tabular-nums " + (m.net < 0 ? "text-red-700" : "")}>{fmt(m.net)}</td>
                  <td className={"p-2 tabular-nums font-semibold " + (m.leftover < 0 ? "text-red-700" : "text-emerald-700")}>{fmt(m.leftover)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        </div>
      )}

      {/* ===== BUDGET ===== */}
      {tab === "budget" && (
        <div className="space-y-4">
          {/* summary */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5 text-center">
              <Mini t="رصيد افتتاحي" v={fmt(initial.opening)} />
              <Mini t="+ الدخل المؤكد" v={fmt(incomeChecked)} cls="text-emerald-700" />
              <Mini t="− الخارج" v={fmt(out)} cls="text-red-700" />
              <Mini t="= صافي الشهر" v={fmt(net)} cls={net < 0 ? "text-red-700" : "text-emerald-700"} />
              <Mini t="الرصيد المتبقّي" v={fmt(leftover)} cls={leftover < 0 ? "text-red-700" : "text-emerald-700"} />
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">الرصيد المتبقّي يُرحّل تلقائيًا كرصيد افتتاحي للشهر التالي. ✅ تعني تم فعلاً (تُحتسب)؛ ⬜ مخطّط فقط.</p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-white p-3 text-xs text-neutral-600">
            ☕ ربح كافيه Qave هذا الشهر: <b className={cafeProfit < 0 ? "text-red-700" : "text-emerald-700"}>{fmt(cafeProfit)}</b>
            <span className="text-neutral-400"> (دخل {fmt(cafe.income)} − مصاريف {fmt(cafe.expenses)} − ثابتة {fmt(cafe.recurring)}) — مرجعي، أضِفه كسطر دخل إن أردت احتسابه.</span>
          </div>

          {SECTIONS.map((s) => (
            <SectionTable key={s.key} title={s.title} color={s.color} section={s.key}
              rows={rowsOf(s.key)} setRow={setRow} addRow={addRow} delRow={delRow}
              allSum={sumAll(s.key)} chkSum={sumChk(s.key)}
              extraRow={s.key === "expense" ? { label: "تحويل للزوجة (تلقائي من التفصيل)", amount: wifeAll } : undefined}
            />
          ))}

          <SaveBar onSave={doSaveBudget} pending={pending} label={"حفظ شهر " + monthLabel(initial.month)} />
        </div>
      )}

      {/* ===== DEBTS ===== */}
      {tab === "debts" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card t="إجمالي الديون" n={fmt(debtOrig)} />
            <Card t="المدفوع" n={fmt(debtPaid)} cls="text-emerald-700" />
            <Card t="المتبقّي علينا" n={fmt(debtOrig - debtPaid)} cls="text-red-700" />
            <Card t="عدد الأشخاص" n={String(people.length)} />
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold">تسجيل دفعة لشخص</h2>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-neutral-500">الشخص<select value={pay.idx} onChange={(e) => setPay({ ...pay, idx: e.target.value })} className={inp + " mt-1 min-w-[150px]"}>
                <option value="">— اختر —</option>
                {people.map((p, i) => <option key={i} value={i}>{p.name} — متبقّي {fmt((Number(p.original_amount) || 0) - paidOf(p))}</option>)}
              </select></label>
              <label className="text-xs text-neutral-500">المبلغ<input value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} type="number" className={numInp + " mt-1 w-28"} /></label>
              <label className="text-xs text-neutral-500">التاريخ<input value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} type="date" className={inp + " mt-1"} /></label>
              <button type="button" className="rounded-lg bg-strow-ink px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={() => { const i = Number(pay.idx); const a = parseFloat(pay.amount); if (pay.idx === "" || !a) return; setPeople((ps) => ps.map((p, idx) => idx === i ? { ...p, payments: [...p.payments, { amount: a, paid_on: pay.date || today() }] } : p)); setPay({ idx: "", amount: "", date: today() }); }}>أضف الدفعة</button>
            </div>
            <p className="mt-1 text-[11px] text-neutral-400">تُخصم فورًا من المتبقّي. اضغط «حفظ الديون» للتثبيت.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <h2 className="bg-rose-900 px-4 py-3 text-sm font-medium text-white">الأشخاص الذين نَدين لهم</h2>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="bg-neutral-50 text-neutral-500"><th className="p-2 text-right">#</th><th className="p-2 text-right">الاسم</th><th className="p-2 text-right">الأصلي</th><th className="p-2 text-right">المدفوع</th><th className="p-2 text-right">المتبقّي</th><th className="p-2 text-right">الحالة</th><th></th></tr></thead>
              <tbody>{people.map((p, i) => { const paid = paidOf(p); const rem = (Number(p.original_amount) || 0) - paid; return (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2"><input value={p.name} onChange={(e) => setPeople((ps) => ps.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} className={inp} /></td>
                  <td className="p-2"><input value={p.original_amount} type="number" onChange={(e) => setPeople((ps) => ps.map((x, k) => k === i ? { ...x, original_amount: parseFloat(e.target.value) || 0 } : x))} className={numInp + " w-28"} /></td>
                  <td className="p-2 tabular-nums">{fmt(paid)}</td>
                  <td className={"p-2 tabular-nums " + (rem > 0 ? "text-red-700" : "text-emerald-700")}>{fmt(rem)}</td>
                  <td className="p-2">{rem <= 0 ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">مسدّد</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">متبقّي</span>}</td>
                  <td className="p-2"><button type="button" className="text-red-600" onClick={() => setPeople((ps) => ps.filter((_, k) => k !== i))}>×</button></td>
                </tr>); })}</tbody>
            </table></div>
            <button type="button" onClick={() => setPeople((ps) => [...ps, { name: "اسم جديد", original_amount: 0, note: "", payments: [] }])} className="m-3 rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-600">+ إضافة شخص</button>
          </div>
          <SaveBar onSave={doSavePeople} pending={pending} label="حفظ الديون" />
        </div>
      )}

      {/* ===== INSTALLMENTS ===== */}
      {tab === "inst" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card t="إجمالي الأقساط" n={fmt(instTotal, 2)} />
            <Card t="المدفوع" n={fmt(instPaidV, 2)} cls="text-emerald-700" />
            <Card t="المتبقّي" n={fmt(instTotal - instPaidV, 2)} cls="text-red-700" />
            <Card t="عدد الخطط" n={String(inst.length)} />
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <h2 className="bg-indigo-900 px-4 py-3 text-sm font-medium text-white">خطط الأقساط</h2>
            <div className="overflow-x-auto"><table className="w-full text-xs whitespace-nowrap">
              <thead><tr className="bg-indigo-900 text-white">{["الاسم", "المجموعة", "الإجمالي", "عدد", "الشهري", "البداية", "الانتهاء", "مدفوعة", "المدفوع", "المتبقّي", "%", ""].map((h, i) => <th key={i} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
              <tbody>{inst.map((it, i) => { const c = instCalc[i]; const upd = (patch: Partial<InstRow>) => setInst((rows) => rows.map((r, k) => k === i ? { ...r, ...patch } : r)); return (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="p-1.5"><input value={it.name} onChange={(e) => upd({ name: e.target.value })} className={inp + " min-w-[120px]"} /></td>
                  <td className="p-1.5"><select value={it.group_name} onChange={(e) => upd({ group_name: e.target.value })} className={inp}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></td>
                  <td className="p-1.5"><input value={it.total} type="number" onChange={(e) => upd({ total: parseFloat(e.target.value) || 0 })} className={numInp + " w-24"} /></td>
                  <td className="p-1.5"><input value={it.installments_count} type="number" onChange={(e) => upd({ installments_count: parseInt(e.target.value) || 0 })} className={numInp + " w-14"} /></td>
                  <td className="p-1.5 tabular-nums text-neutral-700">{fmt(c.monthly, 2)}</td>
                  <td className="p-1.5"><select value={it.start_month} onChange={(e) => upd({ start_month: e.target.value })} className={inp}>{MONTH_KEYS.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}</select></td>
                  <td className="p-1.5 text-neutral-400">{c.endLabel}</td>
                  <td className="p-1.5"><input value={it.paid_count} type="number" onChange={(e) => upd({ paid_count: parseInt(e.target.value) || 0 })} className={numInp + " w-14"} /></td>
                  <td className="p-1.5 tabular-nums text-emerald-700">{fmt(c.paid, 2)}</td>
                  <td className="p-1.5 tabular-nums text-red-700">{fmt(c.remaining, 2)}</td>
                  <td className="p-1.5">{c.pct.toFixed(0)}%</td>
                  <td className="p-1.5"><button type="button" className="text-red-600" onClick={() => setInst((rows) => rows.filter((_, k) => k !== i))}>×</button></td>
                </tr>); })}</tbody>
            </table></div>
            <button type="button" onClick={() => setInst((rows) => [...rows, { name: "خطة جديدة", group_name: "أخرى", total: 0, installments_count: 1, start_month: initial.month, paid_count: 0 }])} className="m-3 rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-600">+ إضافة خطة</button>
          </div>
          <SaveBar onSave={doSaveInst} pending={pending} label="حفظ الأقساط" />
        </div>
      )}
    </div>
  );
}

function Card({ t, n, m, cls }: { t: string; n: string; m?: string; cls?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{t}</div>
      <div className={"mt-1 text-xl font-bold tabular-nums " + (cls || "")}>{n}</div>
      {m && <div className="mt-1 text-[11px] text-neutral-400">{m}</div>}
    </div>
  );
}
function Mini({ t, v, cls }: { t: string; v: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-2 py-2">
      <div className="text-[10px] text-neutral-400">{t}</div>
      <div className={"mt-0.5 text-sm font-semibold tabular-nums " + (cls || "")}>{v}</div>
    </div>
  );
}
function SaveBar({ onSave, pending, label }: { onSave: () => void; pending: boolean; label: string }) {
  return (
    <div className="sticky bottom-3 flex justify-end">
      <button type="button" onClick={onSave} disabled={pending} className="rounded-xl bg-strow-ink px-6 py-2.5 text-sm font-medium text-white shadow-lg transition active:scale-95 disabled:opacity-50">
        {pending ? "جارٍ الحفظ…" : label}
      </button>
    </div>
  );
}

function SectionTable({ title, color, section, rows, setRow, addRow, delRow, allSum, chkSum, extraRow }: {
  title: string; color: string; section: Section; rows: BudgetRow[];
  setRow: (s: Section, i: number, p: Partial<BudgetRow>) => void;
  addRow: (s: Section) => void; delRow: (s: Section, i: number) => void;
  allSum: number; chkSum: number; extraRow?: { label: string; amount: number };
}) {
  const counts = section === "expense" ? chkSum + (extraRow?.amount ?? 0) : chkSum;
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <h2 className={"px-4 py-3 text-sm font-medium text-white " + color}>{title}</h2>
      <div className="overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="bg-neutral-50 text-neutral-500"><th className="p-2 text-right">المصدر</th><th className="p-2 text-right">المبلغ</th><th className="p-2 text-right">✅</th><th></th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-neutral-100">
              <td className="p-2"><input value={r.label} onChange={(e) => setRow(section, i, { label: e.target.value })} className={inp} /></td>
              <td className="p-2"><input value={r.amount} type="number" onChange={(e) => setRow(section, i, { amount: parseFloat(e.target.value) || 0 })} className={numInp + " w-28"} /></td>
              <td className="p-2"><input type="checkbox" checked={r.checked} onChange={(e) => setRow(section, i, { checked: e.target.checked })} /></td>
              <td className="p-2"><button type="button" className="text-red-600" onClick={() => delRow(section, i)}>×</button></td>
            </tr>
          ))}
          {extraRow && (
            <tr className="border-t border-neutral-100 bg-rose-50/40">
              <td className="p-2 font-medium">{extraRow.label}</td>
              <td className="p-2 tabular-nums">{fmt(extraRow.amount)}</td>
              <td className="p-2 text-neutral-400">تلقائي</td><td></td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-bold"><td className="p-2">المحتسب (✅)</td><td className="p-2 tabular-nums">{fmt(counts)}</td><td></td><td></td></tr>
          <tr className="bg-neutral-50 text-neutral-400"><td className="p-2 text-[11px]">من أصل (الكل)</td><td className="p-2 text-[11px] tabular-nums">{fmt(allSum + (extraRow?.amount ?? 0))}</td><td></td><td></td></tr>
        </tfoot>
      </table></div>
      <button type="button" onClick={() => addRow(section)} className="m-3 rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-600">+ إضافة صف</button>
    </div>
  );
}
