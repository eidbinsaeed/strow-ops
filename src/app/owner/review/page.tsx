import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ReviewItem = {
  id: string;
  type: "closing" | "expense";
  date: string;
  amount: number;
  status: string;
  who: string;
  detail: string;
};

function formatAed(n: number) {
  return `AED ${Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default async function OwnerReviewPage() {
  const supabase = createServiceClient();

  const [closingsResult, expensesResult] = await Promise.all([
    supabase
      .from("closings")
      .select(
        "id, closing_date, grand_total, status, baristas(name)"
      )
      .in("status", ["pending_review", "flagged"])
      .order("closing_date", { ascending: false }),
    supabase
      .from("expenses")
      .select(
        "id, expense_date, total, status, suppliers(name), baristas(name)"
      )
      .in("status", ["pending_review", "flagged"])
      .order("expense_date", { ascending: false }),
  ]);

  const closings = (closingsResult.data ?? []) as unknown as Array<{
    id: string;
    closing_date: string;
    grand_total: number;
    status: string;
    baristas: { name: string } | null;
  }>;

  const expenses = (expensesResult.data ?? []) as unknown as Array<{
    id: string;
    expense_date: string;
    total: number;
    status: string;
    suppliers: { name: string } | null;
    baristas: { name: string } | null;
  }>;

  const items: ReviewItem[] = [
    ...closings.map((c) => ({
      id: c.id,
      type: "closing" as const,
      date: c.closing_date,
      amount: Number(c.grand_total),
      status: c.status,
      who: c.baristas?.name ?? "—",
      detail: "End-of-day close",
    })),
    ...expenses.map((e) => ({
      id: e.id,
      type: "expense" as const,
      date: e.expense_date,
      amount: Number(e.total),
      status: e.status,
      who: e.baristas?.name ?? "—",
      detail: e.suppliers?.name ?? "Expense",
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Review queue</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {items.length} {items.length === 1 ? "item" : "items"} waiting on
            you
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            🎉 Queue is empty. Items the AI is unsure about will land here for
            your review.
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Triggers: low confidence on a field, math does not reconcile,
            future date, unknown supplier, anomaly vs history.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">What</th>
                <th className="px-5 py-3 font-medium">Who</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Why flagged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((it) => (
                <tr key={`${it.type}-${it.id}`} className="text-sm">
                  <td className="px-5 py-4">
                    <span className="capitalize">{it.type}</span>
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {formatDate(it.date)}
                  </td>
                  <td className="px-5 py-4 font-medium">{it.detail}</td>
                  <td className="px-5 py-4 text-neutral-600">{it.who}</td>
                  <td className="px-5 py-4 font-medium">
                    {formatAed(it.amount)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        it.status === "flagged"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {it.status.replace("_", " ")}
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
