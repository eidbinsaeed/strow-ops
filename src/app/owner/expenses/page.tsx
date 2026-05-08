import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ExpenseRow = {
  id: string;
  expense_date: string;
  invoice_number: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_method: string;
  status: string;
  suppliers: { name: string } | null;
  categories: { name: string } | null;
  baristas: { name: string } | null;
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "text-emerald-700 bg-emerald-50",
  pending_review: "text-amber-700 bg-amber-50",
  flagged: "text-red-700 bg-red-50",
  rejected: "text-neutral-500 bg-neutral-100",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Transfer",
  credit: "Credit",
};

function formatAed(n: number | null | undefined) {
  if (n == null) return "AED —";
  return `AED ${Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function OwnerExpensesPage() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, expense_date, invoice_number, subtotal, vat_amount, total, payment_method, status, suppliers(name), categories(name), baristas(name)"
    )
    .order("expense_date", { ascending: false })
    .limit(100);

  const expenses = (data ?? []) as unknown as ExpenseRow[];
  const total = expenses.reduce((sum, e) => sum + Number(e.total ?? 0), 0);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Expenses</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {expenses.length} {expenses.length === 1 ? "expense" : "expenses"}{" "}
            recorded · {formatAed(total)} total
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Expense flow ships next session
        </span>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load expenses: {error.message}
        </div>
      ) : expenses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            No expenses yet. Baristas log expenses from the home screen once
            the expense flow ships.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Supplier</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Invoice #</th>
                <th className="px-5 py-3 font-medium">Subtotal</th>
                <th className="px-5 py-3 font-medium">VAT</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Paid</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {expenses.map((e) => (
                <tr key={e.id} className="text-sm">
                  <td className="px-5 py-4 font-medium">
                    {formatDate(e.expense_date)}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {e.suppliers?.name ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {e.categories?.name ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {e.invoice_number ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {formatAed(e.subtotal)}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {formatAed(e.vat_amount)}
                  </td>
                  <td className="px-5 py-4 font-medium">
                    {formatAed(e.total)}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {PAYMENT_LABELS[e.payment_method] ?? e.payment_method}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[e.status] ?? "text-neutral-500 bg-neutral-100"
                      }`}
                    >
                      {e.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">
          ← Dashboard
        </Link>
      </p>
    </div>
  );
}
