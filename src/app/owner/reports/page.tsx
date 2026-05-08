import Link from "next/link";

const REPORTS = [
  {
    title: "Monthly P&L",
    description:
      "Sales total, expenses by category, gross margin, fixed costs, net profit. Compare month over month.",
    when: "Phase 4",
  },
  {
    title: "Category breakdown",
    description:
      "Spend per category over a period. Spot if Beverage Ingredients spiked or Cleaning Supplies crept up.",
    when: "Phase 4",
  },
  {
    title: "Supplier scorecard",
    description:
      "Total spend per supplier, average invoice size, frequency, share of total purchases.",
    when: "Phase 4",
  },
  {
    title: "Cash float reconciliation",
    description:
      "Daily over/short trend by barista. Catch patterns before they become problems.",
    when: "Phase 3",
  },
  {
    title: "VAT report",
    description:
      "Recoverable input VAT vs collected output VAT, ready for quarterly filing.",
    when: "Phase 3",
  },
  {
    title: "Export to Excel / PDF",
    description:
      "Any report above, as a downloadable file you can email to your accountant.",
    when: "Phase 4",
  },
];

export default function OwnerReportsPage() {
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-neutral-500">
            What you will be able to see once data is flowing
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Real P&L computation lands in Phase 4
        </span>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {REPORTS.map((r) => (
          <div
            key={r.title}
            className="rounded-2xl border border-neutral-200 bg-white p-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium">{r.title}</h2>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                {r.when}
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-500">{r.description}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">
          ← Dashboard
        </Link>
      </p>
    </div>
  );
}
