import Link from "next/link";

export const dynamic = "force-dynamic";

const REPORTS = [
  {
    href: "/owner/reports/monthly-pnl",
    title: "Monthly P&L",
    blurb:
      "Sales total, expenses by category, gross margin, fixed costs, net profit. Export to CSV or print to PDF.",
  },
  {
    href: "/owner/reports/category-breakdown",
    title: "Category Breakdown",
    blurb:
      "Spend per category for any date range. Spot if Beverage Ingredients spiked or Cleaning Supplies crept up.",
  },
  {
    href: "/owner/reports/vat",
    title: "VAT Report (5% UAE)",
    blurb:
      "Recoverable input VAT vs collected output VAT, ready for quarterly filing. Includes daily over/short reconciliation.",
  },
];

export default function OwnerReportsLanding() {
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-light tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pick a report. Each one supports a custom period, CSV download, and
          print-to-PDF.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href as never}
            className="group rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-strow-ink"
          >
            <h2 className="text-base font-medium group-hover:text-strow-ink">
              {r.title}
            </h2>
            <p className="mt-2 text-sm text-neutral-500">{r.blurb}</p>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">
          &larr; Dashboard
        </Link>
      </p>
    </div>
  );
}
