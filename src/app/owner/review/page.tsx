import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { ReviewRowActions } from "./ReviewRowActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClosingRow = {
  id: string;
  closing_date: string;
  cash_total: number;
  card_total: number;
  online_total: number;
  grand_total: number;
  status: string;
  notes: string | null;
  baristas: { name: string } | null;
};

type ExpenseRow = {
  id: string;
  expense_date: string;
  invoice_number: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_method: string;
  status: string;
  notes: string | null;
  suppliers: { name: string } | null;
  baristas: { name: string } | null;
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
        "id, closing_date, cash_total, card_total, online_total, grand_total, status, notes, baristas(name)",
      )
      .in("status", ["pending_review", "flagged"])
      .order("closing_date", { ascending: false }),
    supabase
      .from("expenses")
      .select(
        "id, expense_date, invoice_number, subtotal, vat_amount, total, payment_method, status, notes, suppliers(name), baristas(name)",
      )
      .in("status", ["pending_review", "flagged"])
      .order("expense_date", { ascending: false }),
  ]);

  const closings = (closingsResult.data ?? []) as unknown as ClosingRow[];
  const expenses = (expensesResult.data ?? []) as unknown as ExpenseRow[];

  type Item =
    | {
        kind: "closing";
        sortDate: string;
        row: ClosingRow;
      }
    | {
        kind: "expense";
        sortDate: string;
        row: ExpenseRow;
      };

  const items: Item[] = [
    ...closings.map(
      (c): Item => ({ kind: "closing", sortDate: c.closing_date, row: c }),
    ),
    ...expenses.map(
      (e): Item => ({ kind: "expense", sortDate: e.expense_date, row: e }),
    ),
  ].sort((a, b) => (a.sortDate < b.sortDate ? 1 : -1));

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
            Queue is empty. Items the AI is unsure about will land here for
            your review.
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Triggers: low confidence on a field, math does not reconcile,
            future date, unknown supplier, anomaly vs history.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) =>
            it.kind === "closing" ? (
              <ClosingCard key={`c-${it.row.id}`} row={it.row} />
            ) : (
              <ExpenseCard key={`e-${it.row.id}`} row={it.row} />
            ),
          )}
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

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        status === "flagged"
          ? "bg-red-50 text-red-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function ClosingCard({ row }: { row: ClosingRow }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wider text-neutral-600">
              Closing
            </span>
            <StatusPill status={row.status} />
          </div>
          <p className="mt-2 text-base font-medium">
            {formatDate(row.closing_date)} · {formatAed(row.grand_total)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Cash {formatAed(row.cash_total)} · Card {formatAed(row.card_total)}{" "}
            · Online {formatAed(row.online_total)} · by{" "}
            {row.baristas?.name ?? "—"}
          </p>
          {row.notes && (
            <p className="mt-2 text-xs italic text-neutral-500">
              "{row.notes}"
            </p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <ReviewRowActions
          type="closing"
          id={row.id}
          fields={{
            closing_date: row.closing_date,
            cash_total: Number(row.cash_total),
            card_total: Number(row.card_total),
            online_total: Number(row.online_total),
            notes: row.notes,
          }}
        />
      </div>
    </div>
  );
}

function ExpenseCard({ row }: { row: ExpenseRow }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wider text-neutral-600">
              Expense
            </span>
            <StatusPill status={row.status} />
          </div>
          <p className="mt-2 text-base font-medium">
            {formatDate(row.expense_date)} ·{" "}
            {row.suppliers?.name ?? "Unknown supplier"} ·{" "}
            {formatAed(row.total)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {row.payment_method.replace("_", " ")}
            {row.invoice_number ? ` · #${row.invoice_number}` : ""}
            {" · by "}
            {row.baristas?.name ?? "—"}
          </p>
          {row.notes && (
            <p className="mt-2 text-xs italic text-neutral-500">
              "{row.notes}"
            </p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <ReviewRowActions
          type="expense"
          id={row.id}
          fields={{
            expense_date: row.expense_date,
            subtotal: Number(row.subtotal),
            vat_amount: Number(row.vat_amount),
            total: Number(row.total),
            payment_method: row.payment_method,
            invoice_number: row.invoice_number,
            notes: row.notes,
          }}
        />
      </div>
    </div>
  );
}
