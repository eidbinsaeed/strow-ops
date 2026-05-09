import Link from "next/link";
import { PeriodPicker, ReportToolbar } from "@/components/owner/PeriodPicker";
import { fetchSales, fetchExpenses, sumSales, sumExpenses } from "@/lib/reports/queries";
import { currentQuarter, parsePeriod } from "@/lib/reports/period";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VAT_RATE = 0.05;

function aed(n: number) {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function VatReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params, currentQuarter());
  const locale = await getLocale();

  const [sales, expenses] = await Promise.all([
    fetchSales(period.from, period.to),
    fetchExpenses(period.from, period.to),
  ]);
  const s = sumSales(sales);
  const e = sumExpenses(expenses);

  // Output VAT: 5% of sales (assumed VAT-inclusive prices in UAE retail).
  // VAT = grand_total - (grand_total / 1.05)
  const outputVat = s.grand - s.grand / (1 + VAT_RATE);
  const inputVat = e.vat;
  const netVat = outputVat - inputVat;

  const csvHref = `/api/reports/vat/csv?from=${period.from}&to=${period.to}`;

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-light tracking-tight">{tr("report.vat", locale)}</h1>
        <p className="mt-1 text-sm text-neutral-500">{period.label}</p>
      </header>

      <PeriodPicker defaultFrom={period.from} defaultTo={period.to} />
      <ReportToolbar csvHref={csvHref} />

      <div className="space-y-5 print:space-y-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 print:break-inside-avoid">
          <h2 className="mb-3 text-xs uppercase tracking-wider text-neutral-500">
            {tr("report.section.output_vat", locale)}
          </h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span>Total sales (incl. VAT)</span>
              <span className="tabular-nums">{aed(s.grand)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT-exclusive base</span>
              <span className="tabular-nums">{aed(s.grand / (1 + VAT_RATE))}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-1.5 text-base font-medium">
              <span>Output VAT due</span>
              <span className="tabular-nums">{aed(outputVat)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 print:break-inside-avoid">
          <h2 className="mb-3 text-xs uppercase tracking-wider text-neutral-500">
            {tr("report.section.input_vat", locale)}
          </h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span>Total purchases (incl. VAT)</span>
              <span className="tabular-nums">{aed(e.total)}</span>
            </div>
            <div className="flex justify-between">
              <span>Subtotal (excl. VAT)</span>
              <span className="tabular-nums">{aed(e.subtotal)}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-1.5 text-base font-medium">
              <span>Input VAT recoverable</span>
              <span className="tabular-nums">{aed(inputVat)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-strow-ink bg-neutral-50 p-5 print:break-inside-avoid">
          <h2 className="mb-3 text-xs uppercase tracking-wider text-neutral-500">
            {tr("report.section.net_vat", locale)}
          </h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span>Output VAT</span>
              <span className="tabular-nums">{aed(outputVat)}</span>
            </div>
            <div className="flex justify-between">
              <span>Less: Input VAT</span>
              <span className="tabular-nums">- {aed(inputVat)}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-300 pt-1.5 text-base font-medium">
              <span>{netVat >= 0 ? tr("report.vat.payable", locale) : tr("report.vat.refundable", locale)}</span>
              <span className="tabular-nums">{aed(Math.abs(netVat))}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-neutral-400">
          Assumes UAE 5% VAT-inclusive sale prices. Input VAT is taken from
          each bill&apos;s recorded vat_amount field. Talk to your accountant
          before filing - this is an aid, not a substitute for FTA advice.
        </p>
      </div>

      <p className="mt-8 text-xs text-neutral-400 print:hidden">
        <Link href="/owner/reports" className="underline hover:text-strow-ink">
          {tr("nav.reports", locale)}
        </Link>
      </p>
    </div>
  );
}
