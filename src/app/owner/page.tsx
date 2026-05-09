import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import { StatusPill } from "@/components/owner/StatusPill";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function aed(n: number) {
  return `AED ${Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("en-AE", {
    hour: "numeric",
    minute: "2-digit",
  });
}

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

  // UAE-local "today" date string for filtering DATE columns
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Dubai",
  });

  const [
    locationsRes,
    baristasActiveRes,
    baristasOnShiftRes,
    suppliersRes,
    categoriesRes,
    todaySalesRes,
    todayExpensesRes,
    pendingClosingsRes,
    pendingExpensesRes,
    recentClosingsRes,
    recentExpensesRes,
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
    supabase
      .from("closings")
      .select("grand_total")
      .eq("closing_date", today)
      .in("status", ["confirmed", "pending_review"]),
    supabase
      .from("expenses")
      .select("total")
      .eq("expense_date", today)
      .in("status", ["confirmed", "pending_review"]),
    supabase
      .from("closings")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending_review", "flagged"]),
    supabase
      .from("expenses")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending_review", "flagged"]),
    supabase
      .from("closings")
      .select("id, closing_date, grand_total, status, created_at, baristas(name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("expenses")
      .select(
        "id, expense_date, total, status, created_at, suppliers(name), baristas(name)",
      )
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const salesToday = (todaySalesRes.data ?? []).reduce(
    (sum, r) => sum + Number((r as { grand_total: number }).grand_total ?? 0),
    0,
  );
  const expensesToday = (todayExpensesRes.data ?? []).reduce(
    (sum, r) => sum + Number((r as { total: number }).total ?? 0),
    0,
  );
  const netToday = salesToday - expensesToday;
  const needsReview =
    (pendingClosingsRes.count ?? 0) + (pendingExpensesRes.count ?? 0);

  type Activity = {
    kind: "closing" | "expense";
    id: string;
    when: string;
    label: string;
    amount: number;
    status: string;
  };

  type ClosingActivity = {
    id: string;
    closing_date: string;
    grand_total: number;
    status: string;
    created_at: string;
    baristas: { name: string } | null;
  };
  type ExpenseActivity = {
    id: string;
    expense_date: string;
    total: number;
    status: string;
    created_at: string;
    suppliers: { name: string } | null;
    baristas: { name: string } | null;
  };

  const recentClosings = (recentClosingsRes.data ?? []) as unknown as ClosingActivity[];
  const recentExpenses = (recentExpensesRes.data ?? []) as unknown as ExpenseActivity[];

  const activity: Activity[] = [
    ...recentClosings.map((c) => ({
      kind: "closing" as const,
      id: c.id,
      when: c.created_at,
      label: `${tr("nav.sales", locale)} - ${c.baristas?.name ?? "-"}`,
      amount: Number(c.grand_total ?? 0),
      status: c.status,
    })),
    ...recentExpenses.map((e) => ({
      kind: "expense" as const,
      id: e.id,
      when: e.created_at,
      label: `${tr("nav.purchases", locale)} - ${e.suppliers?.name ?? tr("card.unknown_vendor", locale)}`,
      amount: Number(e.total ?? 0),
      status: e.status,
    })),
  ]
    .sort((a, b) => (a.when < b.when ? 1 : -1))
    .slice(0, 8);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <h1 className="text-2xl font-light tracking-tight">
          {tr("page.dashboard", locale)}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {tr("dash.today_at", locale)}
        </p>
      </header>

      <h2 className="mb-3 text-sm font-medium text-neutral-700">
        {tr("dash.todays_flows", locale)}
      </h2>
      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={tr("dash.sales_today", locale)}
          value={aed(salesToday)}
          hint={tr("dash.cash_card_online", locale)}
        />
        <StatCard
          label={tr("dash.expenses_today", locale)}
          value={aed(expensesToday)}
          hint={tr("dash.all_payments", locale)}
        />
        <StatCard
          label={tr("dash.net_today", locale)}
          value={aed(netToday)}
        />
        <StatCard
          label={tr("dash.needs_review", locale)}
          value={String(needsReview)}
          hint={tr("dash.ai_flagged", locale)}
        />
      </div>

      <h2 className="mb-3 text-sm font-medium text-neutral-700">
        {tr("dash.setup_live", locale)}
      </h2>
      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          label={tr("dash.locations", locale)}
          value={String(locationsRes.count ?? 0)}
        />
        <StatCard
          label={tr("dash.baristas", locale)}
          value={String(baristasActiveRes.count ?? 0)}
          hint={tr("dash.active", locale)}
        />
        <StatCard
          label={tr("dash.on_shift", locale)}
          value={String(baristasOnShiftRes.count ?? 0)}
        />
        <StatCard
          label={tr("dash.vendors_count", locale)}
          value={String(suppliersRes.count ?? 0)}
        />
        <StatCard
          label={tr("dash.categories_count", locale)}
          value={String(categoriesRes.count ?? 0)}
          hint={tr("dash.active", locale)}
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">
          {tr("dash.recent_activity", locale)}
        </h2>
        {activity.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
            <p className="text-sm text-neutral-500">
              {tr("dash.no_submissions", locale)}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {activity.map((a) => (
              <Link
                key={`${a.kind}-${a.id}`}
                href={a.kind === "closing" ? "/owner/closings" : "/owner/expenses"}
                className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3 last:border-0 hover:bg-neutral-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.label}</p>
                  <p className="text-xs text-neutral-400">
                    {formatTime(a.when)}
                  </p>
                </div>
                <span className="tabular-nums text-sm">{aed(a.amount)}</span>
                <StatusPill status={a.status} locale={locale} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <Link
          href="/owner/baristas"
          className="rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-strow-ink"
        >
          <p className="text-sm font-medium">{tr("dash.manage_staff", locale)}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {tr("dash.manage_staff_hint", locale)}
          </p>
        </Link>
        <Link
          href="/owner/review"
          className="rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-strow-ink"
        >
          <p className="text-sm font-medium">{tr("nav.pending", locale)}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {tr("dash.pending_hint", locale)}
          </p>
        </Link>
      </section>
    </div>
  );
}
