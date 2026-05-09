import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-xs uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-light text-strow-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
}

export default async function OwnerDashboard() {
  const locale = await getLocale();
  const supabase = createServiceClient();

  // Live counts from the DB — proves the wiring works end-to-end.
  const [
    { count: locationCount },
    { count: baristaCount },
    { count: onShiftCount },
    { count: supplierCount },
    { count: categoryCount },
  ] = await Promise.all([
    supabase.from("locations").select("*", { count: "exact", head: true }),
    supabase
      .from("baristas")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("baristas")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_on_shift", true),
    supabase.from("suppliers").select("*", { count: "exact", head: true }),
    supabase
      .from("categories")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-tight">{tr("page.dashboard", locale)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Today at Qave Cafe — Main
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Sales / Expenses wire up next session
        </span>
      </header>

      <h2 className="mb-3 text-sm font-medium text-neutral-700">
        Today’s flows
      </h2>
      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sales today" value="AED —" hint="Cash + Card + Online" />
        <StatCard label="Expenses today" value="AED —" hint="All payment methods" />
        <StatCard label="Net today" value="AED —" />
        <StatCard label="Needs review" value="—" hint="AI-flagged items" />
      </div>

      <h2 className="mb-3 text-sm font-medium text-neutral-700">
        Setup · live from your database
      </h2>
      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Locations" value={String(locationCount ?? 0)} />
        <StatCard
          label="Baristas"
          value={String(baristaCount ?? 0)}
          hint="Active"
        />
        <StatCard
          label="On shift now"
          value={String(onShiftCount ?? 0)}
        />
        <StatCard label="Suppliers" value={String(supplierCount ?? 0)} />
        <StatCard
          label="Categories"
          value={String(categoryCount ?? 0)}
          hint="Active"
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">
          Recent activity
        </h2>
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            No submissions yet. Baristas log in at{" "}
            <Link href="/login" className="underline">
              strow.app/login
            </Link>{" "}
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
          <p className="text-sm font-medium">Pending Approval</p>
          <p className="mt-1 text-xs text-neutral-500">
            Items the AI was not sure about
          </p>
        </Link>
      </section>
    </div>
  );
}
