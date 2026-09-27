/**
 * Loads the personal finance data exactly as the original finance page did
 * (same tables, same filters, same shapes) — moved here so the new page, the
 * classic page and the finance AI share it.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { ORDER, emptySections, type FinanceData, type Sections } from "./model";

type Page<T> = { data: T[] | null; error: { message: string } | null };
/** Reads every row, 1,000 at a time (the API returns at most 1,000 per request). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function loadFinance(): Promise<FinanceData> {
  const supabase = createServiceClient();
  type LineRow = { month: string; section: string; label: string | null; amount: number; checked: boolean };
  const [lines, eli, instRes, peopleRes, cloRes, expRes, fcRes] = await Promise.all([
    fetchAll<LineRow>((a, b) => supabase.from("finance_budget_lines").select("month,section,label,amount,checked").order("month").order("position").order("id").range(a, b)),
    fetchAll<{ description: string | null; quantity: number; line_total: number }>((a, b) => supabase.from("expense_line_items").select("description,quantity,line_total").order("id").range(a, b)),
    supabase.from("finance_installments").select("*").order("position", { ascending: true }),
    supabase.from("finance_people").select("*").order("position", { ascending: true }),
    supabase.from("closings").select("closing_date,grand_total").eq("status", "confirmed"),
    supabase.from("expenses").select("expense_date,total").eq("status", "confirmed"),
    supabase.from("fixed_costs").select("amount").eq("is_active", true).eq("frequency", "monthly"),
  ]);

  const months: Record<string, Sections> = {};
  for (const m of ORDER) months[m] = emptySections();
  for (const r of lines) {
    const m = r.month;
    if (!months[m]) continue;
    if (r.section === "installment") continue;
    const sec = months[m][r.section as keyof Sections];
    if (sec) sec.push({ l: r.label ?? "", a: Number(r.amount) || 0, c: !!r.checked });
  }
  const plans = ((instRes.data ?? []) as Array<Record<string, unknown>>).map((it) => {
    const total = Number(it.total) || 0;
    const count = Math.max(Number(it.installments_count) || 1, 1);
    return {
      id: it.id as string,
      name: (it.name as string) ?? "",
      group: (it.group_name as string | null) ?? "أخرى",
      total,
      count,
      start: (it.start_month as string | null) ?? "2026-06",
      paid: Math.max(Number(it.paid_count) || 0, 0),
      monthly: count > 0 ? total / count : 0,
    };
  });
  const people = ((peopleRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? "",
    original: Number(p.original_amount) || 0,
  }));
  const incBy: Record<string, number> = {}, expBy: Record<string, number> = {};
  for (const r of (cloRes.data ?? []) as Array<{ closing_date: string; grand_total: number }>) {
    const m = String(r.closing_date).slice(0, 7);
    incBy[m] = (incBy[m] || 0) + Number(r.grand_total || 0);
  }
  for (const r of (expRes.data ?? []) as Array<{ expense_date: string; total: number }>) {
    const m = String(r.expense_date).slice(0, 7);
    expBy[m] = (expBy[m] || 0) + Number(r.total || 0);
  }
  const recurring = ((fcRes.data ?? []) as Array<{ amount: number }>).reduce((s, r) => s + Number(r.amount || 0), 0);
  const items: Record<string, { item: string; qty: number; spend: number; times: number }> = {};
  for (const r of eli) {
    const k = (r.description || "").trim() || "(غير مسمى)";
    const it = items[k] || (items[k] = { item: k, qty: 0, spend: 0, times: 0 });
    it.qty += Number(r.quantity || 0);
    it.spend += Number(r.line_total || 0);
    it.times += 1;
  }
  const top_items = Object.values(items).sort((a, b) => b.spend - a.spend).slice(0, 12);
  const now = ym(new Date());
  const current = now >= "2026-06" && now <= "2028-05" ? now : "2026-06";
  return { current, order: ORDER, months, plans, people, cafe: { income_by_month: incBy, expense_by_month: expBy, recurring, top_items } };
}
