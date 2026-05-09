import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import {
  AddFixedCostForm,
  FixedCostRowActions,
} from "./FixedCostControls";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FixedCostRow = {
  id: string;
  name: string;
  kind: string;
  amount: number;
  frequency: string;
  due_day: number;
  is_active: boolean;
  baristas: { name: string } | null;
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  one_time: "One time",
};

const KIND_LABELS: Record<string, string> = {
  salary: "Salary",
  rent: "Rent",
  utility: "Utility",
  subscription: "Subscription",
  other: "Other",
};

function formatAed(amount: number) {
  return `AED ${Number(amount).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dayOrdinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default async function OwnerFixedCostsPage() {
  const locale = await getLocale();
  const supabase = createServiceClient();

  const [costsResult, baristasResult] = await Promise.all([
    supabase
      .from("fixed_costs")
      .select(
        "id, name, kind, amount, frequency, due_day, is_active, baristas:linked_barista_id(name)"
      )
      .order("is_active", { ascending: false })
      .order("kind", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("baristas")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const costs = (costsResult.data ?? []) as unknown as FixedCostRow[];
  const baristas = (baristasResult.data ?? []) as { id: string; name: string }[];

  const monthlyTotal = costs
    .filter((c) => c.is_active && c.frequency === "monthly")
    .reduce((sum, c) => sum + Number(c.amount), 0);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">{tr("page.recurring", locale)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {costs.filter((c) => c.is_active).length} active
          </p>
        </div>
        <div className="rounded-xl bg-neutral-100 px-4 py-2 text-sm">
          <span className="text-neutral-500">Monthly recurring:</span>{" "}
          <span className="font-medium">{formatAed(monthlyTotal)}</span>
        </div>
      </header>

      <AddFixedCostForm baristas={baristas} />

      {costsResult.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load fixed costs: {costsResult.error.message}
        </div>
      ) : costs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            No fixed costs yet. Add rent, salaries, DEWA, internet — anything
            recurring.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Kind</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Frequency</th>
                <th className="px-5 py-3 font-medium">Due</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {costs.map((c) => (
                <tr key={c.id} className="text-sm">
                  <td className="px-5 py-4">
                    <div className="font-medium">{c.name}</div>
                    {c.baristas?.name && (
                      <div className="text-xs text-neutral-500">
                        {c.baristas.name}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {KIND_LABELS[c.kind] ?? c.kind}
                  </td>
                  <td className="px-5 py-4 font-medium">
                    {formatAed(Number(c.amount))}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {FREQUENCY_LABELS[c.frequency] ?? c.frequency}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {dayOrdinal(c.due_day)}
                  </td>
                  <td className="px-5 py-4">
                    {c.is_active ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-neutral-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <FixedCostRowActions
                      id={c.id}
                      name={c.name}
                      isActive={c.is_active}
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
