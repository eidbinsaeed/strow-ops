import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { FinanceApp } from "@/components/owner/FinanceApp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(y, mo, 0).getDate();
  return { start: `${m}-01`, end: `${m}-${String(last).padStart(2, "0")}` };
}

const OUT_SECTIONS = ["expense", "bills", "installment", "debt", "personal", "reserve"];

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : monthKey(new Date());
  const { start, end } = monthRange(month);
  const supabase = createServiceClient();

  const [budgetRes, allRes, peopleRes, payRes, instRes] = await Promise.all([
    supabase.from("finance_budget_lines").select("*").eq("month", month).order("position", { ascending: true }),
    supabase.from("finance_budget_lines").select("month, section, amount, checked").neq("month", "__template__"),
    supabase.from("finance_people").select("*").order("position", { ascending: true }),
    supabase.from("finance_payments").select("*").order("paid_on", { ascending: false }),
    supabase.from("finance_installments").select("*").order("position", { ascending: true }),
  ]);

  // Cafe profit (reference only)
  const [cloRes, expRes, fcRes] = await Promise.all([
    supabase.from("closings").select("grand_total").eq("status", "confirmed").gte("closing_date", start).lte("closing_date", end),
    supabase.from("expenses").select("total").eq("status", "confirmed").gte("expense_date", start).lte("expense_date", end),
    supabase.from("fixed_costs").select("amount").eq("is_active", true).eq("frequency", "monthly"),
  ]);
  const cafe = {
    income: (cloRes.data ?? []).reduce((s, r) => s + Number(r.grand_total || 0), 0),
    expenses: (expRes.data ?? []).reduce((s, r) => s + Number(r.total || 0), 0),
    recurring: (fcRes.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0),
  };

  // Per-month aggregates: income = checked income; out = checked(expense/bills/installment/debt/personal/reserve) + ALL wife
  const agg = new Map<string, { income: number; out: number }>();
  for (const r of allRes.data ?? []) {
    const m = r.month as string;
    const a = agg.get(m) ?? { income: 0, out: 0 };
    const amt = Number(r.amount) || 0;
    if (r.section === "income") { if (r.checked) a.income += amt; }
    else if (r.section === "wife") { a.out += amt; }
    else if (OUT_SECTIONS.includes(r.section as string)) { if (r.checked) a.out += amt; }
    agg.set(m, a);
  }
  // Chain leftover across months in order.
  const chain = [...agg.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  let running = 0;
  const monthly: { month: string; income: number; out: number; net: number; opening: number; leftover: number }[] = [];
  for (const [m, a] of chain) {
    const opening = running;
    const net = a.income - a.out;
    const leftover = opening + net;
    running = leftover;
    monthly.push({ month: m, income: a.income, out: a.out, net, opening, leftover });
  }
  const sel = monthly.find((x) => x.month === month);
  const opening = sel?.opening ?? 0;

  type Pay = { id: string; person_id: string; amount: number; paid_on: string };
  const payments = (payRes.data ?? []) as unknown as Pay[];

  const initial = {
    month,
    opening,
    monthly: monthly.map((x) => ({ month: x.month, income: x.income, out: x.out, net: x.net, leftover: x.leftover })),
    budget: (budgetRes.data ?? []).map((b) => ({
      section: b.section as string,
      label: (b.label as string) ?? "",
      amount: Number(b.amount) || 0,
      checked: !!b.checked,
      note: (b.note as string | null) ?? "",
    })),
    people: ((peopleRes.data ?? []) as Array<{ id: string; name: string; original_amount: number; note: string | null }>).map((p) => ({
      id: p.id, name: p.name ?? "", original_amount: Number(p.original_amount) || 0, note: p.note ?? "",
      payments: payments.filter((x) => x.person_id === p.id).map((x) => ({ amount: Number(x.amount) || 0, paid_on: x.paid_on })),
    })),
    installments: (instRes.data ?? []).map((it) => ({
      id: it.id as string, name: (it.name as string) ?? "", group_name: (it.group_name as string | null) ?? "أخرى",
      total: Number(it.total) || 0, installments_count: Number(it.installments_count) || 1,
      start_month: (it.start_month as string | null) ?? month, paid_count: Number(it.paid_count) || 0,
    })),
    cafe,
  };

  return (
    <div className="px-6 py-8 md:px-10" dir="rtl">
      <header className="mb-2">
        <h1 className="text-2xl font-light tracking-tight">المالية الشخصية</h1>
        <p className="mt-1 text-sm text-neutral-500">٢٤ شهرًا مترابطة — رصيد كل شهر يُرحّل للشهر التالي. منفصلة تمامًا عن سجلّات الكافيه.</p>
      </header>
      <FinanceApp initial={initial} />
      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">→ لوحة التحكم</Link>
      </p>
    </div>
  );
}
