import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { FinanceApp } from "@/components/owner/FinanceApp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALL: string[] = [];
for (const y of [2026, 2027, 2028]) for (let m = 1; m <= 12; m++) ALL.push(`${y}-${String(m).padStart(2, "0")}`);
const ORDER = ALL.filter((k) => k >= "2026-06" && k <= "2028-05");
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

type Row = { l: string; a: number; c: boolean };
type Sections = { income: Row[]; expense: Row[]; wife: Row[]; bills: Row[]; debt: Row[]; personal: Row[]; reserve: Row[] };

export default async function FinancePage() {
  const supabase = createServiceClient();
  const [linesRes, instRes, peopleRes, cloRes, expRes, fcRes, eliRes] = await Promise.all([
    supabase.from("finance_budget_lines").select("month,section,label,amount,checked"),
    supabase.from("finance_installments").select("*").order("position", { ascending: true }),
    supabase.from("finance_people").select("*").order("position", { ascending: true }),
    supabase.from("closings").select("closing_date,grand_total").eq("status", "confirmed"),
    supabase.from("expenses").select("expense_date,total").eq("status", "confirmed"),
    supabase.from("fixed_costs").select("amount").eq("is_active", true).eq("frequency", "monthly"),
    supabase.from("expense_line_items").select("description,quantity,line_total"),
  ]);

  const months: Record<string, Sections> = {};
  for (const m of ORDER) months[m] = { income: [], expense: [], wife: [], bills: [], debt: [], personal: [], reserve: [] };
  for (const r of (linesRes.data ?? []) as Array<{ month: string; section: string; label: string | null; amount: number; checked: boolean }>) {
    const m = r.month;
    if (!months[m]) continue;
    if (r.section === "installment") continue;
    const sec = months[m][r.section as keyof Sections];
    if (sec) sec.push({ l: r.label ?? "", a: Number(r.amount) || 0, c: !!r.checked });
  }
  const plans = ((instRes.data ?? []) as Array<Record<string, unknown>>).map((it) => ({
    id: it.id as string, name: (it.name as string) ?? "", group: (it.group_name as string | null) ?? "أخرى",
    total: Number(it.total) || 0, count: Math.max(Number(it.installments_count) || 1, 1),
    start: (it.start_month as string | null) ?? "2026-06", paid: Math.max(Number(it.paid_count) || 0, 0),
  }));
  const people = ((peopleRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as string, name: (p.name as string) ?? "", original: Number(p.original_amount) || 0,
  }));
  const incBy: Record<string, number> = {}, expBy: Record<string, number> = {};
  for (const r of (cloRes.data ?? []) as Array<{ closing_date: string; grand_total: number }>) { const m = String(r.closing_date).slice(0, 7); incBy[m] = (incBy[m] || 0) + Number(r.grand_total || 0); }
  for (const r of (expRes.data ?? []) as Array<{ expense_date: string; total: number }>) { const m = String(r.expense_date).slice(0, 7); expBy[m] = (expBy[m] || 0) + Number(r.total || 0); }
  const recurring = ((fcRes.data ?? []) as Array<{ amount: number }>).reduce((s, r) => s + Number(r.amount || 0), 0);
  const items: Record<string, { item: string; qty: number; spend: number; times: number }> = {};
  for (const r of (eliRes.data ?? []) as Array<{ description: string | null; quantity: number; line_total: number }>) {
    const k = (r.description || "").trim() || "(غير مسمى)";
    const it = items[k] || (items[k] = { item: k, qty: 0, spend: 0, times: 0 });
    it.qty += Number(r.quantity || 0); it.spend += Number(r.line_total || 0); it.times += 1;
  }
  const top_items = Object.values(items).sort((a, b) => b.spend - a.spend).slice(0, 12);
  const now = ym(new Date());
  const current = now >= "2026-06" && now <= "2028-05" ? now : "2026-06";
  const initial = { current, order: ORDER, months, plans, people, cafe: { income_by_month: incBy, expense_by_month: expBy, recurring, top_items } };

  return (
    <div className="px-4 py-6 md:px-8" dir="rtl">
      <FinanceApp initial={initial} />
      <p className="mt-6 text-xs text-neutral-400"><Link href="/owner" className="underline hover:text-strow-ink">→ لوحة التحكم</Link></p>
    </div>
  );
}
