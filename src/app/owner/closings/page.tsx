import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

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

const STATUS_STYLES: Record<string, string> = {
  confirmed: "text-emerald-700 bg-emerald-50",
  pending_review: "text-amber-700 bg-amber-50",
  flagged: "text-red-700 bg-red-50",
  rejected: "text-neutral-500 bg-neutral-100",
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
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function OwnerClosingsPage() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("closings")
    .select(
      "id, closing_date, cash_total, card_total, online_total, grand_total, status, notes, baristas(name)"
    )
    .order("closing_date", { ascending: false })
    .limit(100);

  const closings = (data ?? []) as unknown as ClosingRow[];

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Daily Sales</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {closings.length} {closings.length === 1 ? "closing" : "closings"}{" "}
            recorded
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Closings flow ships next session
        </span>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load closings: {error.message}
        </div>
      ) : closings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            No closings yet. Baristas submit end-of-day from{" "}
            <Link href="/login" className="underline">
              strow.app/login
            </Link>{" "}
            once the close flow ships.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Barista</th>
                <th className="px-5 py-3 font-medium">Cash</th>
                <th className="px-5 py-3 font-medium">Card</th>
                <th className="px-5 py-3 font-medium">Online</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {closings.map((c) => (
                <tr key={c.id} className="text-sm">
                  <td className="px-5 py-4 font-medium">
                    {formatDate(c.closing_date)}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {c.baristas?.name ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {formatAed(c.cash_total)}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {formatAed(c.card_total)}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {formatAed(c.online_total)}
                  </td>
                  <td className="px-5 py-4 font-medium">
                    {formatAed(c.grand_total)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[c.status] ?? "text-neutral-500 bg-neutral-100"
                      }`}
                    >
                      {c.status.replace("_", " ")}
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
