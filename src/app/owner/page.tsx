import Link from "next/link";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-light text-strow-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
}

export default function OwnerDashboard() {
  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Today at Qave Cafe — Main
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Live data wires up next session
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sales today" value="AED —" hint="Cash + Card + Online" />
        <StatCard label="Expenses today" value="AED —" hint="All payment methods" />
        <StatCard label="Net today" value="AED —" />
        <StatCard label="Needs review" value="—" hint="AI-flagged items" />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Recent activity</h2>
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            No submissions yet. Baristas log in at{" "}
            <Link href="/login" className="underline">strow.app/login</Link>{" "}
            to submit closings and expenses.
          </p>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <Link
          href="/owner/baristas"
          className="rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-strow-ink"
        >
          <p className="text-sm font-medium">Manage baristas</p>
          <p className="mt-1 text-xs text-neutral-500">
            Add staff, set 4-digit PINs, toggle on-shift status
          </p>
        </Link>
        <Link
          href="/owner/review"
          className="rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-strow-ink"
        >
          <p className="text-sm font-medium">Review queue</p>
          <p className="mt-1 text-xs text-neutral-500">
            Items the AI was not sure about
          </p>
        </Link>
      </section>
    </div>
  );
}
