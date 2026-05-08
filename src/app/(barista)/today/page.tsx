import { redirect } from "next/navigation";
import Link from "next/link";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClosingItem = {
  id: string;
  closing_date: string;
  grand_total: number;
  status: string;
  created_at: string;
};

type ExpenseItem = {
  id: string;
  expense_date: string;
  total: number;
  status: string;
  created_at: string;
  suppliers: { name: string } | null;
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700",
  pending_review: "bg-amber-50 text-amber-700",
  flagged: "bg-red-50 text-red-700",
  rejected: "bg-neutral-100 text-neutral-500",
};

function formatAed(n: number) {
  return `AED ${Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("en-AE", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function BaristaTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const justSubmitted = params.submitted;

  const supabase = createServiceClient();

  // Use UAE-local "today" — the closings/expenses table stores dates as DATE,
  // which we want to filter on the local calendar day, not UTC midnight.
  const today = new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }); // YYYY-MM-DD

  const [closingsResult, expensesResult] = await Promise.all([
    supabase
      .from("closings")
      .select("id, closing_date, grand_total, status, created_at")
      .eq("barista_id", session.bid)
      .eq("closing_date", today)
      .order("created_at", { ascending: false }),
    supabase
      .from("expenses")
      .select(
        "id, expense_date, total, status, created_at, suppliers(name)"
      )
      .eq("barista_id", session.bid)
      .eq("expense_date", today)
      .order("created_at", { ascending: false }),
  ]);

  const closings = (closingsResult.data ?? []) as ClosingItem[];
  const expenses = (expensesResult.data ?? []) as unknown as ExpenseItem[];

  const isEmpty = closings.length === 0 && expenses.length === 0;

  return (
    <main className="flex min-h-dvh flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Link
          href="/home"
          className="text-sm text-neutral-500 transition hover:text-strow-ink"
        >
          ← Back
        </Link>
        <p className="text-sm text-neutral-500">Today</p>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 py-8">
        {justSubmitted && (
          <div className="mb-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
            ✓ {justSubmitted === "closing" ? "Close" : "Expense"} submitted.
            Nice work, {session.name}.
          </div>
        )}

        <h1 className="mb-1 text-xl font-medium">Your submissions today</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Hi {session.name} — here is what you have logged today.
        </p>

        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
            <p className="text-sm text-neutral-500">
              Nothing logged yet today.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/close"
                className="rounded-xl bg-strow-ink px-4 py-2.5 text-sm font-medium text-white"
              >
                End of day close
              </Link>
              <Link
                href="/expense"
                className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium"
              >
                Log expense
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {closings.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
                  End of day close
                </h2>
                <div className="space-y-2">
                  {closings.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {formatAed(Number(c.grand_total))}
                        </p>
                        <p className="text-xs text-neutral-500">
                          Submitted {formatTime(c.created_at)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[c.status] ??
                          "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {c.status.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {expenses.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
                  Expenses
                </h2>
                <div className="space-y-2">
                  {expenses.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {formatAed(Number(e.total))}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {e.suppliers?.name ?? "Supplier"} ·{" "}
                          {formatTime(e.created_at)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[e.status] ??
                          "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {e.status.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="grid grid-cols-2 gap-2 pt-4">
              <Link
                href="/close"
                className="rounded-xl bg-strow-ink px-4 py-2.5 text-center text-sm font-medium text-white"
              >
                + Close
              </Link>
              <Link
                href="/expense"
                className="rounded-xl border border-neutral-300 px-4 py-2.5 text-center text-sm font-medium"
              >
                + Expense
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
