import Link from "next/link";
import { PeriodPicker, ReportToolbar } from "@/components/owner/PeriodPicker";
import { fetchExpenses, groupByCategory, sumExpenses } from "@/lib/reports/queries";
import { currentMonth, parsePeriod } from "@/lib/reports/period";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function aed(n: number) {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function CategoryBreakdownPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params, currentMonth());
  const locale = await getLocale();

  const expenses = await fetchExpenses(period.from, period.to);
  const byCat = groupByCategory(expenses);
  const e = sumExpenses(expenses);

  const csvHref = `/api/reports/category-breakdown/csv?from=${period.from}&to=${period.to}`;

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-light tracking-tight">{tr("report.category_breakdown", locale)}</h1>
        <p className="mt-1 text-sm text-neutral-500">{period.label}</p>
      </header>

      <PeriodPicker defaultFrom={period.from} defaultTo={period.to} />
      <ReportToolbar csvHref={csvHref} />

      {byCat.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">{tr("report.label.no_purchases", locale)}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">{tr("report.col.category", locale)}</th>
                <th className="px-5 py-3 text-right font-medium">{tr("report.col.bills", locale)}</th>
                <th className="px-5 py-3 text-right font-medium">{tr("report.col.total", locale)}</th>
                <th className="px-5 py-3 text-right font-medium">{tr("report.col.share", locale)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {byCat.map((c) => (
                <tr key={c.name} className="text-sm">
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-right text-neutral-600">
                    {c.count}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {aed(c.total)}
                  </td>
                  <td className="px-5 py-3 text-right text-neutral-500">
                    {e.total > 0 ? `${((c.total / e.total) * 100).toFixed(1)}%` : "-"}
                  </td>
                </tr>
              ))}
              <tr className="text-sm font-medium">
                <td className="px-5 py-3">{tr("report.col.total", locale)}</td>
                <td className="px-5 py-3 text-right">{expenses.length}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {aed(e.total)}
                </td>
                <td className="px-5 py-3 text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 text-xs text-neutral-400 print:hidden">
        <Link href="/owner/reports" className="underline hover:text-strow-ink">
          {tr("nav.reports", locale)}
        </Link>
      </p>
    </div>
  );
}
