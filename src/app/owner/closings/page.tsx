import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { RowActions } from "@/components/owner/RowActions";
import { TableFilters, parseFilters } from "@/components/owner/TableFilters";

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
  photo_drive_url: string | null;
  baristas: { name: string } | null;
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700",
  pending_review: "bg-amber-50 text-amber-700",
  flagged: "bg-red-50 text-red-700",
  rejected: "bg-neutral-100 text-neutral-500",
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

export default async function OwnerSalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const supabase = createServiceClient();
  let query = supabase
    .from("closings")
    .select(
      "id, closing_date, cash_total, card_total, online_total, grand_total, status, notes, photo_drive_url, baristas(name)",
    )
    .order("closing_date", { ascending: false })
    .limit(200);

  if (filters.from) query = query.gte("closing_date", filters.from);
  if (filters.to) query = query.lte("closing_date", filters.to);
  if (filters.statuses.length > 0) query = query.in("status", filters.statuses);

  const { data, error } = await query;
  let closings = (data ?? []) as unknown as ClosingRow[];

  // Free-text filter applied in JS over barista name + notes
  if (filters.q) {
    const q = filters.q.toLowerCase();
    closings = closings.filter(
      (c) =>
        (c.baristas?.name || "").toLowerCase().includes(q) ||
        (c.notes || "").toLowerCase().includes(q),
    );
  }

  const grandSum = closings.reduce(
    (sum, c) => sum + Number(c.grand_total ?? 0),
    0,
  );

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Sales</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {closings.length} {closings.length === 1 ? "sale" : "sales"} -{" "}
            {formatAed(grandSum)} total
          </p>
        </div>
      </header>

      <TableFilters searchPlaceholder="Search barista or note..." />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load sales: {error.message}
        </div>
      ) : closings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            No sales match the current filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {closings.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[c.status] ?? "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {c.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-medium">
                    {formatDate(c.closing_date)} -{" "}
                    {formatAed(c.grand_total)}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Cash {formatAed(c.cash_total)} - Card{" "}
                    {formatAed(c.card_total)} - Online{" "}
                    {formatAed(c.online_total)} - by{" "}
                    {c.baristas?.name ?? "-"}
                  </p>
                  {c.notes && (
                    <p className="mt-2 text-xs italic text-neutral-500">
                      {c.notes}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <RowActions
                  type="closing"
                  id={c.id}
                  status={c.status}
                  photoDriveUrl={c.photo_drive_url}
                  fields={{
                    closing_date: c.closing_date,
                    cash_total: Number(c.cash_total),
                    card_total: Number(c.card_total),
                    online_total: Number(c.online_total),
                    notes: c.notes,
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
