import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import {
  AddLiabilityForm,
  LiabilityRowActions,
} from "./LiabilityControls";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LiabilityRow = {
  id: string;
  counterparty: string;
  kind: string;
  amount: number;
  status: string;
  incurred_date: string;
  settled_date: string | null;
  notes: string | null;
};

const KIND_LABELS: Record<string, string> = {
  customer_held: "Customer held",
  iou: "IOU",
  deferred_payment: "Deferred payment",
};

function formatAed(amount: number) {
  return `AED ${Number(amount).toLocaleString("en-AE", {
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

export default async function OwnerLiabilitiesPage() {
  const locale = await getLocale();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("liabilities")
    .select(
      "id, counterparty, kind, amount, status, incurred_date, settled_date, notes"
    )
    .order("status", { ascending: true })
    .order("incurred_date", { ascending: false });

  const liabilities = (data ?? []) as LiabilityRow[];
  const openTotal = liabilities
    .filter((l) => l.status === "open")
    .reduce((sum, l) => sum + Number(l.amount), 0);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">{tr("page.liabilities", locale)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {liabilities.filter((l) => l.status === "open").length} open ·{" "}
            {liabilities.filter((l) => l.status === "settled").length} settled
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm">
          <span className="text-amber-700">Open total:</span>{" "}
          <span className="font-medium text-amber-900">
            {formatAed(openTotal)}
          </span>
        </div>
      </header>

      <AddLiabilityForm />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load liabilities: {error.message}
        </div>
      ) : liabilities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            No liabilities recorded. Customer money held overnight, IOUs, and
            deferred payments live here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Counterparty</th>
                <th className="px-5 py-3 font-medium">Kind</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Incurred</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {liabilities.map((l) => (
                <tr key={l.id} className="text-sm">
                  <td className="px-5 py-4">
                    <div className="font-medium">{l.counterparty}</div>
                    {l.notes && (
                      <div className="text-xs text-neutral-500">{l.notes}</div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {KIND_LABELS[l.kind] ?? l.kind}
                  </td>
                  <td className="px-5 py-4 font-medium">
                    {formatAed(Number(l.amount))}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {formatDate(l.incurred_date)}
                  </td>
                  <td className="px-5 py-4">
                    {l.status === "open" ? (
                      <span className="inline-flex items-center gap-1.5 text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Open
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-neutral-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                        Settled {formatDate(l.settled_date)}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <LiabilityRowActions
                      id={l.id}
                      isSettled={l.status === "settled"}
                      counterparty={l.counterparty}
                    />
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
