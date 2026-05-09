import { createServiceClient } from "@/lib/supabase/server";

export type SalesRow = {
  closing_date: string;
  cash_total: number;
  card_total: number;
  online_total: number;
  grand_total: number;
};

export type ExpenseRow = {
  expense_date: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  category: string | null;
  supplier: string | null;
  payment_method: string;
};

/** Fetch confirmed sales between dates (inclusive). */
export async function fetchSales(
  from: string,
  to: string,
): Promise<SalesRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("closings")
    .select("closing_date, cash_total, card_total, online_total, grand_total")
    .eq("status", "confirmed")
    .gte("closing_date", from)
    .lte("closing_date", to)
    .order("closing_date");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    closing_date: r.closing_date as string,
    cash_total: Number(r.cash_total ?? 0),
    card_total: Number(r.card_total ?? 0),
    online_total: Number(r.online_total ?? 0),
    grand_total: Number(r.grand_total ?? 0),
  }));
}

/** Fetch confirmed bills between dates (inclusive). */
export async function fetchExpenses(
  from: string,
  to: string,
): Promise<ExpenseRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("expenses")
    .select(
      "expense_date, subtotal, vat_amount, total, payment_method, suppliers(name), categories(name)",
    )
    .eq("status", "confirmed")
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("expense_date");
  if (error) throw new Error(error.message);

  type Raw = {
    expense_date: string;
    subtotal: number | null;
    vat_amount: number | null;
    total: number | null;
    payment_method: string;
    suppliers: { name: string } | null;
    categories: { name: string } | null;
  };

  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    expense_date: r.expense_date,
    subtotal: Number(r.subtotal ?? 0),
    vat_amount: Number(r.vat_amount ?? 0),
    total: Number(r.total ?? 0),
    category: r.categories?.name ?? null,
    supplier: r.suppliers?.name ?? null,
    payment_method: r.payment_method,
  }));
}

export function sumSales(sales: SalesRow[]) {
  return sales.reduce(
    (acc, s) => ({
      cash: acc.cash + s.cash_total,
      card: acc.card + s.card_total,
      online: acc.online + s.online_total,
      grand: acc.grand + s.grand_total,
    }),
    { cash: 0, card: 0, online: 0, grand: 0 },
  );
}

export function sumExpenses(rows: ExpenseRow[]) {
  return rows.reduce(
    (acc, r) => ({
      subtotal: acc.subtotal + r.subtotal,
      vat: acc.vat + r.vat_amount,
      total: acc.total + r.total,
    }),
    { subtotal: 0, vat: 0, total: 0 },
  );
}

export function groupByCategory(rows: ExpenseRow[]) {
  const map = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const key = r.category ?? "Uncategorized";
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += r.total;
    cur.count += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total);
}
