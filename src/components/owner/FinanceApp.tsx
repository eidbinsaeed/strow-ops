"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveBudget, savePeople, saveInstallments,
  type BudgetLineInput, type PersonInput, type InstallmentInput,
} from "@/app/owner/finance/actions";

type Section = "income" | "expense" | "wife";
type BudgetRow = { section: Section; label: string; amount: number; checked: boolean; note: string };
type PayRow = { amount: number; paid_on: string };
type PersonRow = { name: string; original_amount: number; note: string; payments: PayRow[] };
type InstRow = { name: string; group_name: string; total: number; installments_count: number; start_month: string; paid_count: number };
type Initial = {
  month: string;
  fromTemplate?: boolean;
  budget: { section: Section; label: string; amount: number; checked: boolean; note: string }[];
  people: { name: string; original_amount: number; note: string; payments: { amount: number; paid_on: string }[] }[];
  installments: { name: string; group_name: string; total: number; installments_count: number; start_month: string; paid_count: number }[];
  cafe: { income: number; expenses: number; recurring: number };
};

const GROUPS = ["بطاقة ائتمانية", "تابي كارد", "تابي مشتريات", "تمارا", "أخرى"];
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTH_KEYS: string[] = [];
for (const y of [2026, 2027]) for (let m = 1; m <= 12; m++) MONTH_KEYS.push(`${y}-${String(m).padStart(2, "0")}`);
const monthLabel = (k: string) => { const [y, m] = k.split("-").map(Number); return `${AR_MONTHS[m - 1]} ${y}`; };

const fmt = (n: number, dec = 0) =>
  (n < 0 ? "-" : "") + "د.إ " + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const today = () => new Date().toISOString().slice(0, 10);

const inp = "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs focus:border-strow-ink focus:outline-none";
const numInp = inp + " text-left";

export function FinanceApp({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "budget" | "debts" | "inst">("overview");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const cafe = initial.cafe;
  const cafeProfit = cafe.income - cafe.expenses - cafe.recurring;
  const cafeSentinel = initial.budget.find((b) => b.section === "income" && b.label === "__cafe_included__");
  const [cafeChecked, setCafeChecked] = useState<boolean>(cafeSentinel ? cafeSentinel.checked : false);
  const cafeContribution = cafeChecked ? cafeProfit : 0;

  const [budget, setBudget] = useState<BudgetRow[]>(
    initial.budget.length
      ? initial.budget.filter((b) => !(b.section === "income" && b.label === "__cafe_included__")).map((b) => ({ ...b }))
      : [
          { section: "income", label: "الراتب", amount: 0, checked: true, note: "" },
          { section: "expense", label: "إيجار الشقة", amount: 0, checked: false, note: "" },
        ],
  );
  const [people, setPeople] = useState<PersonRow[]>(initial.people.map((p) => ({ ...p, payments: p.payments.map((x) => ({ ...x })) })));
  const [inst, setInst] = useState<InstRow[]>(initial.installments.map((i) => ({ ...i })));
  const [pay, setPay] = useState({ idx: "", amount: "", date: today() });

  // ---- budget calcs ----
  const income = budget.filter((b) => b.section === "income");
  const expense = budget.filter((b) => b.section === "expense");
  const wife = budget.filter((b) => b.section === "wife");
  const sumAmt = (rows: BudgetRow[]) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const wifeTotal = sumAmt(wife);
  const incomeTotal = sumAmt(income) + cafeContribution;
  const incomeChecked = income.filter((r) => r.checked).reduce((s, r) => s + (Number(r.amount) || 0), 0) + cafeContribution;
  const expenseTotal = sumAmt(expense) + wifeTotal;
  const expenseChecked = expense.filter((r) => r.checked).reduce((s, r) => s + (Number(r.amount) || 0), 0) + wifeTotal;
  const net = incomeTotal - expenseTotal;
  const savingsRate = incomeTotal > 0 ? (net / incomeTotal) * 100 : 0;

  // ---- debts calcs ----
  const paidOf = (p: PersonRow) => p.payments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const debtOrig = people.reduce((s, p) => s + (Number(p.original_amount) || 0), 0);
  const debtPaid = people.reduce((s, p) => s + paidOf(p), 0);
  const debtRem = debtOrig - debtPaid;

  // ---- installment calcs ----
  const instCalc = useMemo(() => inst.map((it) => {
    const count = Math.max(Number(it.installments_count) || 0, 0);
    const total = Number(it.total) || 0;
    const pc = Math.min(Math.max(Number(it.paid_count) || 0, 0), count);
    const monthly = count > 0 ? total / count : 0;
    const paid = monthly * pc;
    const startI = MONTH_KEYS.indexOf(it.start_month);
    const endI = startI >= 0 ? Math.min(startI + Math.max(count - 1, 0), MONTH_KEYS.length - 1) : -1;
    return { monthly, paid, remaining: total - paid, remCount: count - pc, pct: total > 0 ? (paid / total) * 100 : 0, endLabel: endI >= 0 ? monthLabel(MONTH_KEYS[endI]) : "—" };
  }), [inst]);
  const instTotal = inst.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const instMonthly = instCalc.reduce((s, c) => s + c.monthly, 0);
  const instPaid = instCalc.reduce((s, c) => s + c.paid, 0);

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(null), 2500); }

  function doSaveBudget() {
    const lines: BudgetLineInput[] = budget.map((b) => ({ section: b.section, label: b.label, amount: Number(b.amount) || 0, checked: b.checked, note: b.note }));
    lines.push({ section: "income", label: "__cafe_included__", amount: 0, checked: cafeChecked, note: null });
    startTransition(async () => { const r = await saveBudget(initial.month, lines); if (r.error) flash("خطأ: " + r.error); else { flash("تم حفظ الميزانية ✓"); router.refresh(); } });
  }
  function doSavePeople() {
    const list: PersonInput[] = people.map((p) => ({ name: p.name, original_amount: Number(p.original_amount) || 0, note: p.note, payments: p.payments.map((x) => ({ amount: Number(x.amount) || 0, paid_on: x.paid_on })) }));
    startTransition(async () => { const r = await savePeople(list); if (r.error) flash("خطأ: " + r.error); else { flash("تم حفظ الديون ✓"); router.refresh(); } });
  }
  function doSaveInst() {
    const list: InstallmentInput[] = inst.map((it) => ({ name: it.name, group_name: it.group_name, total: Number(it.total) || 0, installments_count: Number(it.installments_count) || 1, start_month: it.start_month, paid_count: Number(it.paid_count) || 0 }));
    startTransition(async () => { const r = await saveInstallments(list); if (r.error) flash("خطأ: " + r.error); else { flash("تم حفظ الأقساط ✓"); router.refresh(); } });
  }

  // budget row helpers (operate on full budget array by filtering section)
  const setRow = (section: Section, i: number, patch: Partial<BudgetRow>) =>
    setBudget((rows) => { let k = -1; return rows.map((r) => { if (r.section === section) { k++; if (k === i) return { ...r, ...patch }; } return r; }); });
  const addRow = (section: Section) => setBudget((rows) => [...rows, { section, label: "", amount: 0, checked: false, note: "" }]);
  const delRow = (section: Section, i: number) => setBudget((rows) => { let k = -1; return rows.filter((r) => { if (r.section === section) { k++; return !(k === i); } return true; }); });

  const tabBtn = (id: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(id)}
      className={"rounded-full border px-4 py-2 text-sm transition " + (tab === id ? "border-strow-ink bg-strow-ink text-white" : "border-neutral-300 bg-white text-neutral-500")}>
      {label}
    </button>
  );

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
            {MONTH_KEYS.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
          </select>
        </div>
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div>
          <p className="mb-3 text-xs font-semibold text-neutral-500">💡 ملخص ذكي للوضع المالي — {monthLabel(initial.month)}</p>
          <div className="mb-4 rounded-3xl bg-gradient-to-br from-[#6f4e37] to-[#8a6a4f] p-6 text-white">
            <div className="text-sm opacity-90">الصافي الشهري (بعد كل المصاريف)</div>
            <div className="mt-1 text-4xl font-extrabold tabular-nums">{fmt(net)}</div>
            <div className="mt-1 text-sm opacity-90">نسبة الادخار: <b>{savingsRate.toFixed(1)}%</b></div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Card t="إجمالي الدخل الشهري" n={fmt(incomeTotal)} cls="text-emerald-700" />
            <Card t="إجمالي المصاريف" n={fmt(expenseTotal)} cls="text-red-700" />
            <Card t="☕ ربح/خسارة كافيه Qave" n={fmt(cafeProfit)} cls={cafeProfit < 0 ? "text-red-700" : "text-emerald-700"} m={cafeChecked ? "محتسب في الصافي" : "غير محتسب — فعّله من جدول الدخل"} />
            <Bars t="الأقساط — المدفوع / الإجمالي" n={`${fmt(instPaid, 2)} / ${fmt(instTotal, 2)}`} pct={instTotal > 0 ? (instPaid / instTotal) * 100 : 0} color="#15803d" />
            <Bars t="الديون — المتبقّي علينا" n={fmt(debtRem)} pct={debtOrig > 0 ? (debtPaid / debtOrig) * 100 : 0} color="#6f4e37" m={`مدفوع ${fmt(debtPaid)} من ${fmt(debtOrig)}`} />
            <Card t="القسط الشهري الإجمالي" n={fmt(instMonthly, 2)} m="إجمالي ما يخرج للأقساط شهريًا" />
          </div>
        </div>
      )}

      {/* BUDGET */}
      {tab === "budget" && (
        <div className="space-y-4">
          {initial.fromTemplate && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              قيم قياسية محمّلة من القالب لهذا الشهر — عدّل ما يلزم ثم اضغط «حفظ الميزانية» لتثبيت أرقام هذا الشهر.
            </div>
          )}
          <div className="rounded-2xl border border-emerald-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold">☕ ربح كافيه Qave (يُسحب تلقائيًا)</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>دخل الكافيه: <b className="tabular-nums">{fmt(cafe.income)}</b></span>
              <span>− مصاريف: <b className="tabular-nums">{fmt(cafe.expenses)}</b></span>
              <span>− تكاليف ثابتة: <b className="tabular-nums">{fmt(cafe.recurring)}</b></span>
              <span>= {cafeProfit < 0 ? "الخسارة" : "الربح"}: <b className={"tabular-nums " + (cafeProfit < 0 ? "text-red-700" : "text-emerald-700")}>{fmt(cafeProfit)}</b></span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-400">يظهر تلقائيًا كبند «Qave Cafe» في الدخل لشهر {monthLabel(initial.month)}.</p>
          </div>

          <BudgetTable title="الدخل" color="bg-teal-700" rows={income} section="income"
            setRow={setRow} addRow={addRow} delRow={delRow}
            extraTop={{ label: "Qave Cafe (ربح/خسارة الكافيه)", amount: cafeProfit, checked: cafeChecked, onToggle: setCafeChecked }}
            totals={[["مجموع الدخل (الكل)", incomeTotal], ["المؤكد ✓", incomeChecked], ["غير المؤكد", incomeTotal - incomeChecked]]} />

          <BudgetTable title="المصاريف" color="bg-rose-900" rows={expense} section="expense"
            setRow={setRow} addRow={addRow} delRow={delRow}
            extraBottom={wife.length ? { label: "تحويل للزوجة (راعية عطوة)", amount: wifeTotal } : undefined}
            totals={[["مجموع المصاريف (الكل)", expenseTotal], ["المدفوع ✓", expenseChecked], ["المتبقّي (غير مدفوع)", expenseTotal - expenseChecked]]} />

          <BudgetTable title="⭐ تفصيل تحويل الزوجة (راعية عطوة)" color="bg-[#6f4e37]" rows={wife} section="wife"
            setRow={setRow} addRow={addRow} delRow={delRow}
            totals={[["المجموع (يُسحب للمصاريف)", wifeTotal]]} />

          <SaveBar onSave={doSaveBudget} pending={pending} label="حفظ الميزانية" />
        </div>
      )}

      {/* DEBTS */}
      {tab === "debts" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card t="إجمالي الديون" n={fmt(debtOrig)} />
            <Card t="المدفوع" n={fmt(debtPaid)} cls="text-emerald-700" />
            <Card t="المتبقّي علينا" n={fmt(debtRem)} cls="text-red-700" />
            <Card t="عدد الأشخاص" n={String(people.length)} />
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold">تسجيل دفعة لشخص</h2>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-neutral-500">الشخص<select value={pay.idx} onChange={(e) => setPay({ ...pay, idx: e.target.value })} className={inp + " mt-1 min-w-[160px]"}>
                <option value="">— اختر —</option>
                {people.map((p, i) => <option key={i} value={i}>{p.name} — متبقّي {fmt((Number(p.original_amount) || 0) - paidOf(p))}</option>)}
              </select></label>
              <label className="text-xs text-neutral-500">المبلغ<input value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} type="number" className={numInp + " mt-1 w-28"} /></label>
              <label className="text-xs text-neutral-500">التاريخ<input value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} type="date" className={inp + " mt-1"} /></label>
              <button type="button" className="rounded-lg bg-strow-ink px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={() => { const i = Number(pay.idx); const a = parseFloat(pay.amount); if (pay.idx === "" || !a) return; setPeople((ps) => ps.map((p, idx) => idx === i ? { ...p, payments: [...p.payments, { amount: a, paid_on: pay.date || today() }] } : p)); setPay({ idx: "", amount: "", date: today() }); }}>
                أضف الدفعة
              </button>
            </div>
            <p className="mt-1 text-[11px] text-neutral-400">تُخصم فورًا من «المتبقّي». اضغط «حفظ الديون» للحفظ النهائي.</p>
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

      {/* INSTALLMENTS */}
      {tab === "inst" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card t="إجمالي الأقساط" n={fmt(instTotal, 2)} />
            <Card t="القسط الشهري الإجمالي" n={fmt(instMonthly, 2)} />
            <Card t="المدفوع" n={fmt(instPaid, 2)} cls="text-emerald-700" />
            <Card t="المتبقّي" n={fmt(instTotal - instPaid, 2)} cls="text-red-700" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <h2 className="bg-blue-900 px-4 py-3 text-sm font-medium text-white">الأقساط — تفصيل كل خطة</h2>
            <div className="overflow-x-auto"><table className="w-full text-xs whitespace-nowrap">
              <thead><tr className="bg-blue-900 text-white">
                {["اسم القسط", "المجموعة", "الإجمالي", "عدد", "الشهري", "البداية", "الانتهاء", "مدفوعة", "المدفوع", "المتبقّي", "متبقّي", "%", ""].map((h, i) => <th key={i} className="p-2 text-right font-medium">{h}</th>)}
              </tr></thead>
              <tbody>{inst.map((it, i) => { const c = instCalc[i]; const upd = (patch: Partial<InstRow>) => setInst((rows) => rows.map((r, k) => k === i ? { ...r, ...patch } : r)); return (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="p-1.5"><input value={it.name} onChange={(e) => upd({ name: e.target.value })} className={inp + " min-w-[130px]"} /></td>
                  <td className="p-1.5"><select value={it.group_name} onChange={(e) => upd({ group_name: e.target.value })} className={inp}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></td>
                  <td className="p-1.5"><input value={it.total} type="number" onChange={(e) => upd({ total: parseFloat(e.target.value) || 0 })} className={numInp + " w-24"} /></td>
                  <td className="p-1.5"><input value={it.installments_count} type="number" onChange={(e) => upd({ installments_count: parseInt(e.target.value) || 0 })} className={numInp + " w-14"} /></td>
                  <td className="p-1.5 tabular-nums text-neutral-700">{fmt(c.monthly, 2)}</td>
                  <td className="p-1.5"><select value={it.start_month} onChange={(e) => upd({ start_month: e.target.value })} className={inp}>{MONTH_KEYS.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}</select></td>
                  <td className="p-1.5 text-neutral-400">{c.endLabel}</td>
                  <td className="p-1.5"><input value={it.paid_count} type="number" onChange={(e) => upd({ paid_count: parseInt(e.target.value) || 0 })} className={numInp + " w-14"} /></td>
                  <td className="p-1.5 tabular-nums text-emerald-700">{fmt(c.paid, 2)}</td>
                  <td className="p-1.5 tabular-nums text-red-700">{fmt(c.remaining, 2)}</td>
                  <td className="p-1.5">{c.remCount}</td>
                  <td className="p-1.5"><div className="h-1.5 w-12 overflow-hidden rounded bg-neutral-200"><div className="h-full bg-emerald-600" style={{ width: c.pct.toFixed(0) + "%" }} /></div><span className="text-[10px] text-neutral-400">{c.pct.toFixed(0)}%</span></td>
                  <td className="p-1.5"><button type="button" className="text-red-600" onClick={() => setInst((rows) => rows.filter((_, k) => k !== i))}>×</button></td>
                </tr>); })}</tbody>
            </table></div>
            <button type="button" onClick={() => setInst((rows) => [...rows, { name: "خطة جديدة", group_name: "أخرى", total: 0, installments_count: 1, start_month: initial.month, paid_count: 0 }])} className="m-3 rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-600">+ إضافة خطة قسط</button>
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
function Bars({ t, n, pct, color, m }: { t: string; n: string; pct: number; color: string; m?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{t}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{n}</div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-neutral-200"><div className="h-full" style={{ width: Math.min(pct, 100).toFixed(0) + "%", background: color }} /></div>
      <div className="mt-1 text-[11px] text-neutral-400">{m ?? pct.toFixed(0) + "% مسدّد"}</div>
    </div>
  );
}
function SaveBar({ onSave, pending, label }: { onSave: () => void; pending: boolean; label: string }) {
  return (
    <div className="flex justify-end">
      <button type="button" onClick={onSave} disabled={pending} className="rounded-xl bg-strow-ink px-6 py-2.5 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50">
        {pending ? "جارٍ الحفظ…" : label}
      </button>
    </div>
  );
}

function BudgetTable({ title, color, rows, section, setRow, addRow, delRow, totals, extraTop, extraBottom }: {
  title: string; color: string; rows: BudgetRow[]; section: Section;
  setRow: (s: Section, i: number, p: Partial<BudgetRow>) => void;
  addRow: (s: Section) => void; delRow: (s: Section, i: number) => void;
  totals: [string, number][]; extraTop?: { label: string; amount: number; checked?: boolean; onToggle?: (v: boolean) => void }; extraBottom?: { label: string; amount: number };
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <h2 className={"px-4 py-3 text-sm font-medium text-white " + color}>{title}</h2>
      <div className="overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="bg-neutral-50 text-neutral-500"><th className="p-2 text-right">المصدر</th><th className="p-2 text-right">المبلغ</th><th className="p-2 text-right">✓</th><th></th></tr></thead>
        <tbody>
          {extraTop && (
            <tr className="border-t border-neutral-100 bg-emerald-50/40">
              <td className="p-2 font-medium">{extraTop.label} <span className="text-[10px] text-neutral-400">(تلقائي)</span></td>
              <td className={"p-2 tabular-nums " + (extraTop.amount < 0 ? "text-red-700" : "")}>{fmt(extraTop.amount)}</td>
              <td className="p-2">{extraTop.onToggle ? <input type="checkbox" checked={!!extraTop.checked} onChange={(e) => extraTop.onToggle!(e.target.checked)} title="احتسبه في الصافي" /> : <span className="text-emerald-700">تلقائي</span>}</td><td></td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-neutral-100">
              <td className="p-2"><input value={r.label} onChange={(e) => setRow(section, i, { label: e.target.value })} className={inp} /></td>
              <td className="p-2"><input value={r.amount} type="number" onChange={(e) => setRow(section, i, { amount: parseFloat(e.target.value) || 0 })} className={numInp + " w-28"} /></td>
              <td className="p-2"><input type="checkbox" checked={r.checked} onChange={(e) => setRow(section, i, { checked: e.target.checked })} /></td>
              <td className="p-2"><button type="button" className="text-red-600" onClick={() => delRow(section, i)}>×</button></td>
            </tr>
          ))}
          {extraBottom && (
            <tr className="border-t border-neutral-100 bg-rose-50/40">
              <td className="p-2 font-medium">{extraBottom.label}</td>
              <td className="p-2 tabular-nums">{fmt(extraBottom.amount)}</td>
              <td className="p-2 text-neutral-400">تلقائي</td><td></td>
            </tr>
          )}
        </tbody>
        <tfoot>{totals.map(([lbl, val], i) => (
          <tr key={i} className="border-t-2 border-neutral-200 bg-neutral-50 font-bold"><td className="p-2">{lbl}</td><td className="p-2 tabular-nums">{fmt(val)}</td><td></td><td></td></tr>
        ))}</tfoot>
      </table></div>
      <button type="button" onClick={() => addRow(section)} className="m-3 rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-600">+ إضافة صف</button>
    </div>
  );
}
