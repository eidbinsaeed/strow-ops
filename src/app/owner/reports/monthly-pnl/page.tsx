import Link from "next/link";
import { PeriodPicker, ReportToolbar } from "@/components/owner/PeriodPicker";
import {
  fetchSales,
  fetchExpenses,
  sumSales,
  sumExpenses,
  groupByCategory,
} from "@/lib/reports/queries";
import { currentMonth, parsePeriod } from "@/lib/reports/period";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function aed(n: number) {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function MonthlyPnLPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params, currentMonth());

  const [sales, expenses] = await Promise.all([
    fetchSales(period.from, period.to),
    fetchExpenses(period.from, period.to),
  ]);

  const sTotals = sumSales(sales);
  const eTotals = sumExpenses(expenses);
  const byCat = groupByCategory(expenses);
  const grossMargin = sTotals.grand - eTotals.total;
  const grossMarginPct =
    sTotals.grand > 0 ? (grossMargin / sTotals.grand) * 100 : 0;

  const csvHref = `/api/reports/monthly-pnl/csv?from=${period.from}&to=${period.to}`;

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-light tracking-tight">Monthly P&amp;L</h1>
        <p className="mt-1 text-sm text-neutral-500">{period.label}</p>
      </header>

      <PeriodPicker defaultFrom={period.from} defaultTo={period.to} />
      <ReportToolbar csvHref={csvHref} />

      <div className="space-y-5 print:space-y-3">
        <Section title="Sales">
          <Row label="Cash" value={aed(sTotals.cash)} />
          <Row label="Card" value={aed(sTotals.card)} />
          <Row label="Online" value={aed(sTotals.online)} />
          <Row label="Total sales" value={aed(sTotals.grand)} bold />
        </Section>

        <Section title="Purchases by category">
          {byCat.length === 0 ? (
            <p className="text-sm text-neutral-500">No purchases in period.</p>
          ) : (
            byCat.map((c) => (
              <Row
                key={c.name}
                label={`${c.name} (${c.count})`}
                value={aed(c.total)}
              />
            ))
          )}
          <Row label="Total purchases" value={aed(eTotals.total)} bold />
        </Section>

        <Section title="Gross margin">
          <Row label="Sales" value={aed(sTotals.grand)} />
          <Row label="Less: purchases" value={`- ${aed(eTotals.total)}`} />
          <Row
            label={`Gross margin (${grossMarginPct.toFixed(1)}%)`}
            value={aed(grossMargin)}
            bold
          />
        </Section>

        <p className="text-xs text-neutral-400">
          Note: only confirmed sales and bills are included. Recurring (fixed)
          costs and liabilities are not yet rolled in - that lands when the
          full P&amp;L ships.
        </p>
      </div>

      <p className="mt-8 text-xs text-neutral-400 print:hidden">
        <Link href="/owner/reports" className="underline hover:text-strow-ink">
          &larr; Reports
        </Link>
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 print:break-inside-avoid">
      <h2 className="mb-3 text-xs uppercase tracking-wider text-neutral-500">
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 ${
        bold
          ? "border-t border-neutral-200 pt-1.5 text-base font-medium"
          : "text-sm"
      }`}
    >
      <span className="text-neutral-700">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
