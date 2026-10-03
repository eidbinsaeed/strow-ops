"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveBudget, saveInstallments, createPerson, updatePerson, deletePerson, type BudgetLineInput } from "@/app/owner/finance/actions";
import { MAN, OUT, SECT, makeModel, mLabel, mName, type FinanceData, type Plan, type Person, type SecKey, type Sections } from "@/lib/finance/model";
import { Chart } from "@/components/ai/Charts";
import { Portal } from "@/components/pulse/Portal";

type Tab = "overview" | "month" | "inst" | "debts" | "analytics";
const TABS: [Tab, string][] = [["overview", "نظرة عامة"], ["month", "الميزانية"], ["inst", "الأقساط"], ["debts", "الديون"], ["analytics", "تحليلات"]];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const toNum = (v: string) => {
  const s = v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const COLOR: Record<string, string> = Object.fromEntries(SECT.map((s) => [s.k, s.c]));
const TITLE: Record<string, string> = Object.fromEntries(SECT.map((s) => [s.k, s.t]));
const INPUT = "h-12 w-full rounded-2xl border border-neutral-300 bg-white px-4 text-base text-strow-ink focus:border-strow-ink focus:outline-none";

type LineEdit = { mode: "new" | "edit"; month: string; section: SecKey; origSection: SecKey; index: number; label: string; amount: string; paid: boolean; confirmDelete?: boolean };
type PlanEdit = { index: number | null; name: string; group: string; monthly: string; count: string; start: string; paid: string; confirmDelete?: boolean };
type PersonEdit = { id: string | null; name: string; original: string; oldName: string; confirmDelete?: boolean };
type PayEdit = { name: string; amount: string; month: string };

const I = {
  lock: <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  eye: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  eyeOff: <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.3-1" /></svg>,
  spark: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>,
  plus: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>,
};

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <Portal>
      <div dir="rtl" className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0F1C2B]/40 sm:items-center sm:p-4" onClick={onClose}>
        <div className="pulse-pop max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-strow-ink">{title}</h2>
            <button type="button" aria-label="إغلاق" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-xl leading-none text-strow-ink">×</button>
          </div>
          <div className="flex flex-col gap-3.5">{children}</div>
        </div>
      </div>
    </Portal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

/** 24 months: bars = each month's net (actual up to now, planned after), line = running balance. */
function TrendMini({ nets, cum, now }: { nets: number[]; cum: number[]; now: number }) {
  const W = 240, H = 84, n = Math.max(nets.length, 1), band = W / n, bw = band * 0.62;
  const lo = Math.min(0, ...nets), hi = Math.max(1, ...nets), span = hi - lo || 1;
  const y = (v: number) => 4 + (H - 8) * (1 - (v - lo) / span);
  const clo = Math.min(0, ...cum), chi = Math.max(1, ...cum), cspan = chi - clo || 1;
  const cy = (v: number) => 4 + (H - 8) * (1 - (v - clo) / cspan);
  const x = (i: number) => i * band + band / 2;
  const past = cum.slice(0, now + 1).map((v, i) => `${x(i).toFixed(1)},${cy(v).toFixed(1)}`).join(" ");
  const fut = cum.slice(now).map((v, i) => `${x(i + now).toFixed(1)},${cy(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[84px] w-full" style={{ direction: "ltr" }} role="img" aria-label="صافي كل شهر والرصيد المتراكم">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#D4D9E0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {nets.map((v, i) => (
        <rect key={i} x={i * band + (band - bw) / 2} y={Math.min(y(v), y(0))} width={bw} height={Math.max(Math.abs(y(v) - y(0)), 1)} rx="1.5" fill={v < 0 ? "#9A1B12" : i === now ? "#2350D0" : i < now ? "#0F1C2B" : "#B7C0CE"} />
      ))}
      <polyline points={past} fill="none" stroke="#C98300" strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <polyline points={fut} fill="none" stroke="#C98300" strokeWidth="2.2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function FinancePulse({ initial }: { initial: FinanceData }) {
  const order = initial.order;
  const [months, setMonths] = useState<Record<string, Sections>>(() => clone(initial.months));
  const [plans, setPlans] = useState<Plan[]>(() => clone(initial.plans));
  const [people, setPeople] = useState<Person[]>(() => clone(initial.people));
  const [cur, setCur] = useState(initial.current);
  const [tab, setTab] = useState<Tab>("overview");
  const [hide, setHide] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lineEdit, setLineEdit] = useState<LineEdit | null>(null);
  const [planEdit, setPlanEdit] = useState<PlanEdit | null>(null);
  const [personEdit, setPersonEdit] = useState<PersonEdit | null>(null);
  const [payEdit, setPayEdit] = useState<PayEdit | null>(null);
  const [bulk, setBulk] = useState<"on" | "off" | null>(null);
  const saving = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const toastTimer = useRef<number | undefined>(undefined);
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      setHide(localStorage.getItem("strow:fin-hide") === "1");
    } catch {
      /* private mode */
    }
  }, []);

  // Fresh data from the server (after a save, or after the AI changed something) — unless a save is still running.
  useEffect(() => {
    if (saving.current > 0) return;
    setMonths(clone(initial.months));
    setPlans(clone(initial.plans));
    setPeople(clone(initial.people));
  }, [initial]);

  // Keep the chosen month visible in the strip — sideways only, never jumping the page.
  useEffect(() => {
    const chip = stripRef.current?.querySelector<HTMLElement>(`[data-m="${cur}"]`);
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [cur, tab]);

  const model = useMemo(() => makeModel({ order, months, plans, cafe: initial.cafe }), [order, months, plans, initial.cafe]);
  const nowIdx = order.indexOf(initial.current);
  const idx = order.indexOf(cur);

  const flash = (t: string, ms = 1800) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  };
  /** Saves run one after another, in order, so a later change never gets overwritten by an earlier one. */
  const run = (job: () => Promise<{ ok?: boolean; error?: string }>) => {
    saving.current += 1;
    flash("يحفظ…", 60_000);
    queue.current = queue.current.then(async () => {
      try {
        const r = await job();
        flash(r?.error ? `تعذّر الحفظ: ${r.error}` : "محفوظ ✓", r?.error ? 5000 : 1600);
      } catch (e) {
        flash(`تعذّر الحفظ: ${e instanceof Error ? e.message : String(e)}`, 5000);
      } finally {
        saving.current -= 1;
      }
    });
  };
  const changeMonth = (m: string, fn: (s: Sections) => void) => {
    const next = clone(months);
    if (!next[m]) return;
    fn(next[m]);
    setMonths(next);
    const lines = makeModel({ order, months: next, plans, cafe: initial.cafe }).toLines(m) as BudgetLineInput[];
    run(() => saveBudget(m, lines));
  };
  const planInput = (p: Plan) => {
    const count = Math.max(Math.round(+p.count || 1), 1);
    const monthly = +p.monthly || 0;
    const total = Math.abs((+p.total || 0) - monthly * count) < 0.01 ? +p.total || 0 : Math.round(monthly * count * 100) / 100;
    return { name: p.name, group_name: p.group, total, installments_count: count, start_month: p.start, paid_count: Math.max(Math.round(+p.paid || 0), 0) };
  };
  const commitPlans = (next: Plan[]) => {
    setPlans(next);
    run(() => saveInstallments(next.map(planInput)));
  };

  const N = (v: number, cls = "") => <span className={`font-display tabular-nums ${cls}`}>{hide ? "•••" : fmt(v)}</span>;
  const toggleHide = () => {
    const v = !hide;
    setHide(v);
    try {
      localStorage.setItem("strow:fin-hide", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  // ---------- numbers for the chosen month ----------
  const plannedInc = model.plannedIncome(cur);
  const recvInc = model.incomeOf(cur);
  const plannedOut = model.plannedOut(cur);
  const paidOut = model.outOf(cur);
  const left = plannedInc - plannedOut;
  // "باقي تدفعه" leaves out the weekly cash (مصروفي الشخصي) that isn't ticked yet — it's
  // pocket money, not a bill he can miss. Once ticked it still counts in "دفعت" as before.
  const allowanceLeft = (months[cur]?.personal ?? []).filter((r) => !r.c).reduce((a, r) => a + (+r.a || 0), 0);
  const toPay = Math.max(plannedOut - paidOut - allowanceLeft, 0);
  const ser = model.series();
  const balance = ser[idx]?.leftover ?? 0;
  const nets = order.map((m, i) => (i <= nowIdx ? ser[i].net : model.plannedIncome(m) - model.plannedOut(m)));
  let acc = 0;
  const cum = nets.map((v) => (acc += v));
  const endBalance = cum[cum.length - 1] ?? 0;
  type Due = { key: string; kind: "line" | "inst"; sec: SecKey | "installment"; i: number; label: string; amount: number };
  const due: Due[] = [
    ...OUT.flatMap((k) => (months[cur]?.[k] ?? []).map((r, i) => ({ key: `${k}-${i}`, kind: "line" as const, sec: k, i, label: r.l, amount: +r.a || 0, paid: r.c }))).filter((x) => !x.paid && x.sec !== "personal"),
    ...model.instLines(cur).filter((l) => !l.paid).map((l) => ({ key: `inst-${l.pi}`, kind: "inst" as const, sec: "installment" as const, i: l.pi, label: `قسط ${l.name}`, amount: l.amount })),
  ].sort((a, b) => b.amount - a.amount);

  const toggleInst = (pi: number) => {
    const p = plans[pi];
    if (!p) return;
    const k = order.indexOf(cur) - order.indexOf(p.start);
    if (k < 0) return;
    const next = clone(plans);
    next[pi].paid = k < (+p.paid || 0) ? k : Math.max(+p.paid || 0, k + 1);
    commitPlans(next);
  };
  const payDue = (d: Due) => {
    if (d.kind === "inst") toggleInst(d.i);
    else changeMonth(cur, (s) => {
      const r = s[d.sec as SecKey][d.i];
      if (r) r.c = true;
    });
  };

  // ---------- views ----------
  const overview = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 px-1">
        <span className="text-[13px] text-neutral-500">المتبقي بعد الالتزامات — {mLabel(cur)}</span>
        <div className="flex items-baseline gap-2">
          {N(left, `text-[52px] font-bold leading-none tracking-[-2px] ${left < 0 ? "text-[#9A1B12]" : ""}`)}
          <span className="text-lg font-semibold text-neutral-500">د.إ</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-300">
          <div className="pulse-fill h-1.5 rounded-full bg-strow-ink" style={{ width: `${plannedOut > 0 ? Math.min(100, Math.round((paidOut / plannedOut) * 100)) : 0}%` }} />
        </div>
        <span className="text-[12.5px] text-neutral-500">
          دفعت {N(paidOut, "text-strow-ink")} من {N(plannedOut, "text-strow-ink")} ملتزم بها هذا الشهر
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "الدخل", v: plannedInc, s: <>مستلم {N(recvInc)}</> },
          { l: "الالتزامات", v: plannedOut, s: <>باقي {N(toPay)}</> },
          { l: "رصيدك", v: balance, s: <>منذ {mName(order[0])} {order[0].slice(0, 4)}</> },
        ].map((x) => (
          <div key={x.l} className="flex min-w-0 flex-col gap-0.5 rounded-[20px] bg-white px-3 py-2.5">
            <span className="text-[11.5px] text-neutral-500">{x.l}</span>
            {N(x.v, `text-lg font-bold ${x.v < 0 ? "text-[#9A1B12]" : ""}`)}
            <span className="truncate text-[11px] text-neutral-500">{x.s}</span>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setTab("analytics")} className="flex flex-col gap-2 rounded-[24px] bg-white px-4 pb-3 pt-3.5 text-start">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-bold">24 شهر</span>
          <span className="text-[12px] text-neutral-500">
            بنهاية {mLabel(order[order.length - 1])}: {N(endBalance, "text-strow-ink font-semibold")}
          </span>
        </span>
        <TrendMini nets={nets} cum={cum} now={Math.max(nowIdx, 0)} />
        <span className="flex gap-3 text-[11px] text-neutral-500">
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-strow-ink" />فعلي</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-[#B7C0CE]" />مخطط</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-[#C98300]" />الرصيد</span>
        </span>
      </button>
      <div className="flex flex-col rounded-[24px] bg-white px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-bold">باقي تدفعه</span>
          {N(toPay, "text-[15px] font-bold")}
        </div>
        {due.length === 0 ? <p className="py-2 text-sm text-[#2F7A5B]">كل التزامات هذا الشهر مدفوعة.</p> : null}
        {due.slice(0, 2).map((d) => (
          <label key={d.key} className="flex min-h-11 items-center gap-3 border-t border-[#EDF0F3]">
            <input type="checkbox" checked={false} onChange={() => payDue(d)} className="h-[22px] w-[22px] accent-[#C0392B]" aria-label={`علّم ${d.label} مدفوع`} />
            <span className="flex min-w-0 flex-1 items-center gap-2 text-[14.5px]">
              <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR[d.sec] }} />
              <span className="truncate">{d.label}</span>
            </span>
            {N(d.amount, "text-[15px] font-semibold text-[#C0392B]")}
          </label>
        ))}
        {due.length > 2 ? (
          <button type="button" onClick={() => setTab("month")} className="min-h-10 border-t border-[#EDF0F3] pt-2 text-start text-[13.5px] font-semibold text-strow-blue">
            الكل ({due.length}) — افتح الميزانية
          </button>
        ) : null}
      </div>
    </div>
  );

  const secCard = (k: SecKey) => {
    const rows = months[cur]?.[k] ?? [];
    const inc = k === "income";
    const total = rows.reduce((a, r) => a + (+r.a || 0), 0);
    const done = rows.filter((r) => r.c).reduce((a, r) => a + (+r.a || 0), 0);
    return (
      <div key={k} className="flex flex-col gap-2 rounded-[24px] bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[16px] font-bold">
            <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR[k] }} />
            <span className="truncate">{TITLE[k]}</span>
          </span>
          {N(total, "text-[16px] font-bold")}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-1.5 rounded-full" style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%`, background: COLOR[k] }} />
          </div>
          <span className="text-[11.5px] text-neutral-500">
            {rows.filter((r) => r.c).length} من {rows.length}
          </span>
        </div>
        <div className="flex flex-col">
          {rows.map((r, i) => (
            <div key={i} className="flex min-h-12 items-center gap-3 border-t border-[#EDF0F3]">
              <input
                type="checkbox"
                checked={r.c}
                onChange={() => changeMonth(cur, (s) => { s[k][i].c = !s[k][i].c; })}
                className={`h-[22px] w-[22px] shrink-0 ${inc ? "accent-[#2F7A5B]" : "accent-[#C0392B]"}`}
                aria-label={`${r.l} ${r.c ? "مدفوع" : "غير مدفوع"}`}
              />
              <button
                type="button"
                onClick={() => setLineEdit({ mode: "edit", month: cur, section: k, origSection: k, index: i, label: r.l, amount: String(r.a), paid: r.c })}
                className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 text-start"
              >
                <span className={`truncate text-[15px] ${r.c ? "text-neutral-500" : "text-strow-ink"}`}>{r.l || "بند"}</span>
                {N(+r.a || 0, `text-[15px] ${inc && (+r.a || 0) >= 0 ? "text-[#2F7A5B]" : "text-[#C0392B]"} ${r.c ? "opacity-60" : "font-bold"}`)}
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLineEdit({ mode: "new", month: cur, section: k, origSection: k, index: -1, label: "", amount: "", paid: k !== "income" })}
          className="flex min-h-10 items-center gap-1.5 self-start text-[14px] font-semibold text-strow-blue"
        >
          {I.plus}بند جديد
        </button>
      </div>
    );
  };

  const instCard = () => {
    const lines = model.instLines(cur);
    if (!lines.length) return null;
    const total = lines.reduce((a, l) => a + l.amount, 0);
    const done = lines.filter((l) => l.paid).reduce((a, l) => a + l.amount, 0);
    return (
      <div key="installment" className="flex flex-col gap-2 rounded-[24px] bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[16px] font-bold">
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.installment }} />
            {TITLE.installment}
            <span className="rounded-lg bg-[#E3EAFB] px-2 py-0.5 text-[11px] font-semibold text-[#1A3FA8]">من الخطط</span>
          </span>
          {N(total, "text-[16px] font-bold")}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-1.5 rounded-full" style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%`, background: COLOR.installment }} />
        </div>
        {lines.map((l) => (
          <label key={l.pi} className="flex min-h-12 items-center gap-3 border-t border-[#EDF0F3]">
            <input type="checkbox" checked={l.paid} onChange={() => toggleInst(l.pi)} className="h-[22px] w-[22px] accent-[#C0392B]" aria-label={`قسط ${l.name}`} />
            <span className={`min-w-0 flex-1 truncate text-[15px] ${l.paid ? "text-neutral-500" : ""}`}>{l.name}</span>
            {N(l.amount, `text-[15px] text-[#C0392B] ${l.paid ? "opacity-60" : "font-bold"}`)}
          </label>
        ))}
      </div>
    );
  };

  const monthView = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-[24px] bg-white px-4 py-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          {[
            { l: "الدخل المستلم", v: recvInc, s: <>من {N(plannedInc)}</>, c: "" },
            { l: "دفعت", v: paidOut, s: <>من {N(plannedOut)}</>, c: "" },
            { l: "باقي تدفعه", v: toPay, s: <>{due.length} بنود{allowanceLeft > 0 ? " · بدون مصروفك" : ""}</>, c: "text-[#B26B00]" },
            { l: "يتبقى لك", v: left, s: <>بعد كل الالتزامات</>, c: left < 0 ? "text-[#9A1B12]" : "text-[#2F7A5B]" },
          ].map((x) => (
            <div key={x.l} className="flex flex-col gap-0.5">
              <span className="text-[12px] text-neutral-500">{x.l}</span>
              {N(x.v, `text-[22px] font-bold ${x.c}`)}
              <span className="text-[11.5px] text-neutral-500">{x.s}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setBulk("on")} className="min-h-11 flex-1 rounded-full border border-neutral-300 text-[13.5px] font-semibold">علّم الكل مدفوع</button>
          <button type="button" onClick={() => setBulk("off")} className="min-h-11 flex-1 rounded-full border border-neutral-300 text-[13.5px] font-semibold">إلغاء التعليم</button>
        </div>
      </div>
      {SECT.map((s) => (s.k === "installment" ? instCard() : secCard(s.k)))}
    </div>
  );

  const allPlans = plans.map((p, i) => ({ p, i, c: model.planCalc(p) }));
  const instRemaining = allPlans.reduce((a, x) => a + x.c.remaining, 0);
  const lastEnd = allPlans.filter((x) => x.c.remCount > 0).map((x) => x.c.end).sort().pop();
  const future = order.slice(Math.max(idx, 0));
  const instView = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-1">
        <span className="text-[13px] text-neutral-500">باقي عليك في الأقساط</span>
        <div className="flex items-baseline gap-2">{N(instRemaining, "text-[44px] font-bold leading-none tracking-[-1.5px]")}<span className="font-semibold text-neutral-500">د.إ</span></div>
        <span className="text-[12.5px] text-neutral-500">
          {N(model.instPlanned(cur), "text-strow-ink")} هذا الشهر{lastEnd ? <> • آخر قسط {mLabel(lastEnd)}</> : null}
        </span>
      </div>
      {future.length > 1 ? (
        <Chart block={{ type: "chart", kind: "area", title: "متى تخف الأقساط", subtitle: "مجموع الأقساط لكل شهر", labels: future.map((m) => `${mName(m)} ${m.slice(2, 4)}`), series: [{ name: "الأقساط", values: future.map((m) => Math.round(model.instPlanned(m))) }], unit: "AED" }} />
      ) : null}
      {allPlans.map(({ p, i, c }) => {
        const doneAll = c.remCount <= 0;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setPlanEdit({ index: i, name: p.name, group: p.group, monthly: String(Math.round(c.monthly * 100) / 100), count: String(p.count), start: p.start, paid: String(p.paid) })}
            className="flex flex-col gap-2 rounded-[24px] bg-white px-4 py-4 text-start"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-[16px] font-bold">
                <span className="truncate">{p.name || "خطة"}</span>
                <span className="shrink-0 rounded-lg bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">{p.group}</span>
              </span>
              {doneAll ? <span className="rounded-lg bg-[#E4F2EB] px-2 py-0.5 text-[12px] font-semibold text-[#2F7A5B]">خالص</span> : <span className="text-[15px] font-bold">{N(c.monthly)}<span className="text-[11.5px] font-normal text-neutral-500"> / شهر</span></span>}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100"><span className="block h-2 rounded-full" style={{ width: `${Math.round(c.pct)}%`, background: doneAll ? "#2F7A5B" : "#2350D0" }} /></span>
              <span className="font-display text-[12px] tabular-nums text-neutral-500">{c.paidCount}/{c.count}</span>
            </span>
            <span className="text-[12.5px] text-neutral-500">{doneAll ? "كل الأقساط مدفوعة" : <>باقي {c.remCount} شهر • {N(c.remaining, "text-strow-ink")} د.إ • آخر قسط {mLabel(c.end)}</>}</span>
          </button>
        );
      })}
      <button type="button" onClick={() => setPlanEdit({ index: null, name: "", group: "أخرى", monthly: "", count: "12", start: cur, paid: "0" })} className="flex min-h-12 items-center justify-center gap-1.5 rounded-[24px] border border-dashed border-neutral-400 text-[14px] font-semibold text-strow-ink">
        {I.plus}خطة أقساط جديدة
      </button>
    </div>
  );

  const debtRows = people.map((p) => {
    const paid = model.paidPerson(p.name);
    return { p, paid, rem: Math.max(p.original - paid, 0) };
  });
  const debtsView = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-1">
        <span className="text-[13px] text-neutral-500">باقي عليك في الديون</span>
        <div className="flex items-baseline gap-2">{N(debtRows.reduce((a, d) => a + d.rem, 0), "text-[44px] font-bold leading-none tracking-[-1.5px] text-[#9A1B12]")}<span className="font-semibold text-neutral-500">د.إ</span></div>
        <span className="text-[12.5px] text-neutral-500">سددت {N(debtRows.reduce((a, d) => a + d.paid, 0), "text-strow-ink")} من {N(people.reduce((a, p) => a + p.original, 0), "text-strow-ink")} • الدفعات تُسجّل في «سداد الديون» باسم الشخص</span>
      </div>
      {debtRows.map(({ p, paid, rem }) => (
        <div key={p.id} className="flex flex-col gap-2.5 rounded-[24px] bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setPersonEdit({ id: p.id, name: p.name, original: String(p.original), oldName: p.name })} className="min-w-0 text-start">
              <span className="block truncate text-[16px] font-bold">{p.name || "اسم"}</span>
              <span className="text-[12px] text-neutral-500">اضغط للتعديل</span>
            </button>
            {rem <= 0 && p.original > 0 ? (
              <span className="rounded-lg bg-[#E4F2EB] px-2.5 py-1 text-[12px] font-semibold text-[#2F7A5B]">خالص</span>
            ) : (
              <button type="button" onClick={() => setPayEdit({ name: p.name, amount: "", month: cur })} className="min-h-10 rounded-full bg-strow-ink px-4 text-[13.5px] font-semibold text-white">سدّد</button>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-2 rounded-full" style={{ width: `${p.original > 0 ? Math.min(100, Math.round((paid / p.original) * 100)) : 0}%`, background: rem <= 0 ? "#2F7A5B" : "#9A1B12" }} />
          </div>
          <div className="flex justify-between text-[12.5px] text-neutral-500">
            <span>سددت {N(paid, "text-strow-ink")} من {N(p.original, "text-strow-ink")}</span>
            <span>باقي {N(rem, rem > 0 ? "text-[#9A1B12] font-semibold" : "text-[#2F7A5B]")}</span>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setPersonEdit({ id: null, name: "", original: "", oldName: "" })} className="flex min-h-12 items-center justify-center gap-1.5 rounded-[24px] border border-dashed border-neutral-400 text-[14px] font-semibold">
        {I.plus}شخص جديد
      </button>
    </div>
  );

  const outSplit = [
    ...OUT.map((k) => ({ label: TITLE[k], v: model.sumAll(cur, k) })),
    { label: TITLE.installment, v: model.instPlanned(cur) },
  ].filter((x) => x.v > 0);
  const upto = order.slice(0, Math.max(nowIdx, 0) + 1);
  const cafeMonths = upto.filter((m) => (initial.cafe.income_by_month[m] || 0) > 0);
  const negMonths = ser.slice(0, nowIdx + 1).filter((x) => x.net < 0).length;
  const withIncome = ser.slice(0, nowIdx + 1).filter((x) => x.income > 0);
  const avgSave = withIncome.length ? (withIncome.reduce((a, x) => a + x.net / x.income, 0) / withIncome.length) * 100 : 0;
  const cp = model.cafeProfit(cur);
  const analytics = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 rounded-[20px] bg-white px-3.5 py-3">
          <span className="text-[12px] text-neutral-500">متوسط الادخار</span>
          <span className={`font-display text-xl font-bold ${avgSave < 0 ? "text-[#9A1B12]" : "text-[#2F7A5B]"}`}>{hide ? "•••" : `${Math.round(avgSave)}%`}</span>
          <span className="text-[11px] text-neutral-500">من الدخل، الأشهر الماضية</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-[20px] bg-white px-3.5 py-3">
          <span className="text-[12px] text-neutral-500">أشهر بالسالب</span>
          <span className={`font-display text-xl font-bold ${negMonths ? "text-[#9A1B12]" : "text-[#2F7A5B]"}`}>{negMonths}</span>
          <span className="text-[11px] text-neutral-500">من {upto.length} أشهر</span>
        </div>
      </div>
      {outSplit.length ? <Chart block={{ type: "chart", kind: "donut", title: `أين يذهب المال — ${mLabel(cur)}`, labels: outSplit.map((x) => x.label), series: [{ name: "المبلغ", values: outSplit.map((x) => Math.round(x.v)) }], unit: "AED" }} /> : null}
      {upto.length > 1 ? (
        <Chart block={{ type: "chart", kind: "bar", title: "الدخل مقابل المصروف", subtitle: "المدفوع فعلاً كل شهر", labels: upto.map((m) => `${mName(m)} ${m.slice(2, 4)}`), series: [{ name: "الدخل", values: upto.map((m) => Math.round(model.incomeOf(m))) }, { name: "المصروف", values: upto.map((m) => Math.round(model.outOf(m))) }], unit: "AED" }} />
      ) : null}
      <div className="flex flex-col gap-2 rounded-[24px] bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[16px] font-bold">كافيه Qave — {mLabel(cur)}</span>
          <span className="rounded-lg bg-[#E3EAFB] px-2 py-0.5 text-[11px] font-semibold text-[#1A3FA8]">من Strow</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[13px] text-neutral-500">
          <span>المبيعات {N(cp.inc, "text-strow-ink font-semibold")}</span>
          <span>المشتريات {N(cp.exp, "text-strow-ink font-semibold")}</span>
          <span>ثابتة {N(cp.rec, "text-strow-ink font-semibold")}</span>
          <span>الربح {N(cp.profit, `font-bold ${cp.profit < 0 ? "text-[#9A1B12]" : "text-[#2F7A5B]"}`)}</span>
        </div>
      </div>
      {cafeMonths.length > 1 ? (
        <Chart block={{ type: "chart", kind: "line", title: "ربح الكافيه كل شهر", labels: cafeMonths.map((m) => `${mName(m)} ${m.slice(2, 4)}`), series: [{ name: "الربح", values: cafeMonths.map((m) => Math.round(model.cafeProfit(m).profit)) }], unit: "AED" }} />
      ) : null}
      {initial.cafe.top_items.length ? (
        <Chart block={{ type: "chart", kind: "hbar", title: "أكثر مشتريات الكافيه", labels: initial.cafe.top_items.slice(0, 6).map((x) => x.item.slice(0, 28)), series: [{ name: "الصرف", values: initial.cafe.top_items.slice(0, 6).map((x) => Math.round(x.spend)) }], unit: "AED" }} />
      ) : null}
    </div>
  );

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-[640px] flex-col gap-3 text-strow-ink">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-bold leading-tight">المالية الشخصية</h1>
          <p className="flex items-center gap-1 text-[12px] text-neutral-500">{I.lock}خاصة بك — لا يراها الموظفون ولا Autopilot</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={toggleHide} aria-label={hide ? "إظهار الأرقام" : "إخفاء الأرقام"} className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 bg-white">
            {hide ? I.eyeOff : I.eye}
          </button>
          <Link href="/owner/finance/assistant" className="flex h-11 items-center gap-1.5 rounded-full bg-strow-blue px-4 text-[14px] font-semibold text-white">
            {I.spark}المساعد
          </Link>
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
        <div className="inline-flex gap-0.5 rounded-full bg-white/70 p-1">
          {TABS.map(([k, t]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`shrink-0 rounded-full px-3.5 py-2 text-[13.5px] transition ${tab === k ? "bg-strow-ink font-semibold text-white" : "text-neutral-600"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab !== "debts" ? (
        <div ref={stripRef} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {order.map((m, i) => {
            const on = m === cur;
            const dotC = i === nowIdx ? "#8FB0FF" : i > nowIdx ? "#C9CFD7" : ser[i].net < 0 ? "#9A1B12" : "#2F7A5B";
            return (
              <button key={m} data-m={m} type="button" onClick={() => setCur(m)} className={`flex min-w-[64px] shrink-0 flex-col items-center rounded-2xl px-2.5 py-1.5 ${on ? "bg-strow-ink text-white" : "bg-white text-strow-ink"}`}>
                <span className="text-[13px] font-semibold">{mName(m)}</span>
                <span className="flex items-center gap-1 font-display text-[10.5px] opacity-80">
                  <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dotC }} />
                  {m.slice(0, 4)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {tab === "overview" ? overview : tab === "month" ? monthView : tab === "inst" ? instView : tab === "debts" ? debtsView : analytics}

      <p className="pt-2 text-center text-[12px] text-neutral-500">
        تُحفظ نسخة احتياطية من بياناتك يوميًا •{" "}
        <Link href="/owner/finance/classic" className="underline">النسخة القديمة</Link>
      </p>

      {toast ? (
        <Portal>
          <div className="pointer-events-none fixed inset-x-0 bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))] z-[75] flex justify-center px-4">
            <span className="ai-pop rounded-full bg-strow-ink px-4 py-2 text-[13px] font-semibold text-white shadow-lg">{toast}</span>
          </div>
        </Portal>
      ) : null}

      {lineEdit ? (
        <Sheet title={lineEdit.mode === "new" ? `بند جديد — ${TITLE[lineEdit.section]}` : "تعديل البند"} onClose={() => setLineEdit(null)}>
          <Field label="الاسم"><input className={INPUT} value={lineEdit.label} onChange={(e) => setLineEdit({ ...lineEdit, label: e.target.value })} placeholder="مثال: تصليح السيارة" /></Field>
          <Field label="المبلغ (د.إ)"><input className={INPUT} inputMode="decimal" value={lineEdit.amount} onChange={(e) => setLineEdit({ ...lineEdit, amount: e.target.value })} placeholder="0" /></Field>
          <Field label="الباب">
            <select className={INPUT} value={lineEdit.section} onChange={(e) => setLineEdit({ ...lineEdit, section: e.target.value as SecKey })}>
              {MAN.map((k) => <option key={k} value={k}>{TITLE[k]}</option>)}
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" checked={lineEdit.paid} onChange={(e) => setLineEdit({ ...lineEdit, paid: e.target.checked })} className={`h-[22px] w-[22px] ${lineEdit.section === "income" ? "accent-[#2F7A5B]" : "accent-[#C0392B]"}`} />
            {lineEdit.section === "income" ? "مستلم" : "مدفوع"}
          </label>
          <button
            type="button"
            onClick={() => {
              const le = lineEdit;
              const row = { l: le.label.trim() || "بند", a: toNum(le.amount), c: le.paid };
              changeMonth(le.month, (s) => {
                if (le.mode === "new") {
                  s[le.section].push(row);
                } else if (le.origSection === le.section) {
                  s[le.section][le.index] = row;
                } else {
                  s[le.origSection].splice(le.index, 1);
                  s[le.section].push(row);
                }
              });
              setLineEdit(null);
            }}
            className="min-h-12 rounded-full bg-strow-ink text-[15px] font-semibold text-white"
          >
            حفظ
          </button>
          {lineEdit.mode === "edit" ? (
            <button
              type="button"
              onClick={() => {
                if (!lineEdit.confirmDelete) return setLineEdit({ ...lineEdit, confirmDelete: true });
                const le = lineEdit;
                changeMonth(le.month, (s) => { s[le.origSection].splice(le.index, 1); });
                setLineEdit(null);
              }}
              className={`min-h-11 rounded-full text-[14px] font-semibold ${lineEdit.confirmDelete ? "bg-[#9A1B12] text-white" : "text-[#9A1B12]"}`}
            >
              {lineEdit.confirmDelete ? "اضغط مرة ثانية للحذف" : "حذف البند"}
            </button>
          ) : null}
        </Sheet>
      ) : null}

      {planEdit ? (
        <Sheet title={planEdit.index == null ? "خطة أقساط جديدة" : "تعديل الخطة"} onClose={() => setPlanEdit(null)}>
          <Field label="الاسم"><input className={INPUT} value={planEdit.name} onChange={(e) => setPlanEdit({ ...planEdit, name: e.target.value })} placeholder="مثال: السيارة" /></Field>
          <Field label="المجموعة"><input className={INPUT} value={planEdit.group} onChange={(e) => setPlanEdit({ ...planEdit, group: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="القسط الشهري"><input className={INPUT} inputMode="decimal" value={planEdit.monthly} onChange={(e) => setPlanEdit({ ...planEdit, monthly: e.target.value })} /></Field>
            <Field label="عدد الأقساط"><input className={INPUT} inputMode="numeric" value={planEdit.count} onChange={(e) => setPlanEdit({ ...planEdit, count: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="يبدأ من">
              <select className={INPUT} value={planEdit.start} onChange={(e) => setPlanEdit({ ...planEdit, start: e.target.value })}>
                {order.map((m) => <option key={m} value={m}>{mLabel(m)}</option>)}
              </select>
            </Field>
            <Field label="أقساط مدفوعة"><input className={INPUT} inputMode="numeric" value={planEdit.paid} onChange={(e) => setPlanEdit({ ...planEdit, paid: e.target.value })} /></Field>
          </div>
          <button
            type="button"
            onClick={() => {
              const pe = planEdit;
              const monthly = toNum(pe.monthly), count = Math.max(Math.round(toNum(pe.count)), 1);
              const paid = Math.min(Math.max(Math.round(toNum(pe.paid)), 0), count);
              const next = clone(plans);
              const base: Plan = { name: pe.name.trim() || "خطة", group: pe.group.trim() || "أخرى", monthly, count, start: pe.start, paid, total: monthly * count };
              if (pe.index == null) next.push(base);
              else {
                const old = next[pe.index];
                const same = Math.abs((+old.monthly || 0) - monthly) < 0.005 && old.count === count;
                next[pe.index] = { ...base, id: old.id, total: same ? old.total : monthly * count, monthly: same ? old.monthly : monthly };
              }
              commitPlans(next);
              setPlanEdit(null);
            }}
            className="min-h-12 rounded-full bg-strow-ink text-[15px] font-semibold text-white"
          >
            حفظ
          </button>
          {planEdit.index != null ? (
            <button
              type="button"
              onClick={() => {
                if (!planEdit.confirmDelete) return setPlanEdit({ ...planEdit, confirmDelete: true });
                const at = planEdit.index;
                commitPlans(plans.filter((_, i) => i !== at));
                setPlanEdit(null);
              }}
              className={`min-h-11 rounded-full text-[14px] font-semibold ${planEdit.confirmDelete ? "bg-[#9A1B12] text-white" : "text-[#9A1B12]"}`}
            >
              {planEdit.confirmDelete ? "اضغط مرة ثانية لحذف الخطة" : "حذف الخطة"}
            </button>
          ) : null}
        </Sheet>
      ) : null}

      {personEdit ? (
        <Sheet title={personEdit.id ? "تعديل الشخص" : "شخص جديد"} onClose={() => setPersonEdit(null)}>
          <Field label="الاسم"><input className={INPUT} value={personEdit.name} onChange={(e) => setPersonEdit({ ...personEdit, name: e.target.value })} /></Field>
          <Field label="المبلغ الأصلي للدين (د.إ)"><input className={INPUT} inputMode="decimal" value={personEdit.original} onChange={(e) => setPersonEdit({ ...personEdit, original: e.target.value })} /></Field>
          {personEdit.id && personEdit.oldName && personEdit.name.trim() !== personEdit.oldName ? (
            <p className="rounded-2xl bg-[#FDF3E1] px-3 py-2 text-[12.5px] text-[#B26B00]">الدفعات السابقة مسجلة باسم «{personEdit.oldName}». لو غيّرت الاسم لن تُحسب له إلا إذا احتوى الاسم الجديد على القديم.</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const pe = personEdit;
              const original = toNum(pe.original);
              const name = pe.name.trim() || "اسم جديد";
              if (pe.id) {
                const id = pe.id;
                setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, name, original } : p)));
                run(() => updatePerson(id, { name, original_amount: original }));
              } else {
                run(() => createPerson(name, original));
              }
              setPersonEdit(null);
            }}
            className="min-h-12 rounded-full bg-strow-ink text-[15px] font-semibold text-white"
          >
            حفظ
          </button>
          {personEdit.id ? (
            <button
              type="button"
              onClick={() => {
                if (!personEdit.confirmDelete) return setPersonEdit({ ...personEdit, confirmDelete: true });
                const id = personEdit.id as string;
                setPeople((ps) => ps.filter((p) => p.id !== id));
                run(() => deletePerson(id));
                setPersonEdit(null);
              }}
              className={`min-h-11 rounded-full text-[14px] font-semibold ${personEdit.confirmDelete ? "bg-[#9A1B12] text-white" : "text-[#9A1B12]"}`}
            >
              {personEdit.confirmDelete ? "اضغط مرة ثانية للحذف" : "حذف الشخص"}
            </button>
          ) : null}
        </Sheet>
      ) : null}

      {payEdit ? (
        <Sheet title={`سداد لـ ${payEdit.name}`} onClose={() => setPayEdit(null)}>
          <Field label="المبلغ (د.إ)"><input className={INPUT} inputMode="decimal" value={payEdit.amount} onChange={(e) => setPayEdit({ ...payEdit, amount: e.target.value })} placeholder="0" autoFocus /></Field>
          <Field label="الشهر">
            <select className={INPUT} value={payEdit.month} onChange={(e) => setPayEdit({ ...payEdit, month: e.target.value })}>
              {order.map((m) => <option key={m} value={m}>{mLabel(m)}</option>)}
            </select>
          </Field>
          <button
            type="button"
            disabled={toNum(payEdit.amount) <= 0}
            onClick={() => {
              const pe = payEdit;
              changeMonth(pe.month, (s) => { s.debt.push({ l: pe.name, a: toNum(pe.amount), c: true }); });
              setPayEdit(null);
            }}
            className="min-h-12 rounded-full bg-strow-ink text-[15px] font-semibold text-white disabled:opacity-40"
          >
            سجّل الدفعة
          </button>
        </Sheet>
      ) : null}

      {bulk ? (
        <Sheet title={bulk === "on" ? "علّم كل بنود الشهر مدفوعة؟" : "إلغاء تعليم كل البنود؟"} onClose={() => setBulk(null)}>
          <p className="text-[14px] text-neutral-600">{mLabel(cur)} — ينطبق على كل الأبواب (الأقساط تبقى كما هي).</p>
          <button
            type="button"
            onClick={() => {
              const on = bulk === "on";
              changeMonth(cur, (s) => MAN.forEach((k) => s[k].forEach((r) => { r.c = on; })));
              setBulk(null);
            }}
            className="min-h-12 rounded-full bg-strow-ink text-[15px] font-semibold text-white"
          >
            نعم
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}
