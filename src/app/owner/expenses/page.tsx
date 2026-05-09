import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { RowActions } from "@/components/owner/RowActions";
import { Suspense } from "react";
import { TableFilters } from "@/components/owner/TableFilters";
import { parseFilters } from "@/lib/filters";

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
  notes: string | null;
  photo_drive_url: string | null;
  suppliers: { name: string } | null;
  categories: { name: string } | null;
  baristas: { name: string } | null;
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700",
  pending_review: "bg-amber-50 text-amber-700",
  flagged: "bg-red-50 text-red-700",
  rejected: "bg-neutral-100 text-neutral-500",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  credit: "Credit",
};

function formatAed(n: number | null | undefined) {
  if (n == null) return "AED -";
  return `AED ${Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-AE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function OwnerPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const supabase = createServiceClient();
  let query = supabase
    .from("expenses")
    .select(
      "id, expense_date, invoice_number, subtotal, vat_amount, total, payment_method, status, notes, photo_drive_url, suppliers(name), categories(name), baristas(name)",
    )
    .order("expense_date", { ascending: false })
    .limit(200);

  if (filters.from) query = query.gte("expense_date", filters.from);
  if (filters.to) query = query.lte("expense_date", filters.to);
  if (filters.statuses.length > 0) query = query.in("status", filters.statuses);

  const { data, error } = await query;
  let expenses = (data ?? []) as unknown as ExpenseRow[];

  if (filters.q) {
    const q = filters.q.toLowerCase();
    expenses = expenses.filter(
      (e) =>
        (e.suppliers?.name || "").toLowerCase().includes(q) ||
        (e.invoice_number || "").toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q),
    );
  }

  const total = expenses.reduce((sum, e) => sum + Number(e.total ?? 0), 0);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Purchases</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {expenses.length} {expenses.length === 1 ? "bill" : "bills"} -{" "}
            {formatAed(total)} total
          </p>
        </div>
      </header>

      <Suspense fallback={null}><TableFilters searchPlaceholder="Search vendor, invoice, or note..." /></Suspense>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load purchases: {error.message}
        </div>
      ) : expenses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            No bills match the current filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {expenses.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[e.status] ?? "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {e.status.replace("_", " ")}
                    </span>
                    {e.categories?.name && (
                      <span className="text-xs text-neutral-500">
                        {e.categories.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-base font-medium">
                    {formatDate(e.expense_date)} -{" "}
                    {e.suppliers?.name ?? "Unknown vendor"} -{" "}
                    {formatAed(e.total)}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {PAYMENT_LABELS[e.payment_method] ?? e.payment_method}
                    {e.invoice_number ? ` - #${e.invoice_number}` : ""}
                    {" - VAT "}
                    {formatAed(e.vat_amount)}
                    {" - by "}
                    {e.baristas?.name ?? "-"}
                  </p>
                  {e.notes && (
                    <p className="mt-2 text-xs italic text-neutral-500">
                      {e.notes}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <RowActions
                  type="expense"
                  id={e.id}
                  status={e.status}
                  photoDriveUrl={e.photo_drive_url}
                  fields={{
                    expense_date: e.expense_date,
                    subtotal: Number(e.subtotal),
                    vat_amount: Number(e.vat_amount),
                    total: Number(e.total),
                    payment_method: e.payment_method,
                    invoice_number: e.invoice_number,
                    notes: e.notes,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">
          &larr; Dashboard
        </Link>
      </p>
    </div>
  );
}
