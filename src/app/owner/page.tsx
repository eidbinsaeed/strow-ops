import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import type { Locale } from "@/lib/i18n/dict";
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-light tabular-nums text-strow-ink">
        {value}
      </p>
    </div>
  );
}

function TrendPill({ pct, locale }: { pct: number; locale: Locale }) {
  const down = pct < 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
        down ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
      }`}
    >
      <span aria-hidden>{down ? "▼" : "▲"}</span>
      {Math.abs(pct)}% {tr("dash.trend.vs_avg", locale)}
    </span>
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
    kpisRes,
    dailyFlowRes,
    badgesRes,
    cashDiscRes,
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
    // Month-to-date KPIs + projections (tz-aware, one row per active location)
    supabase.from("v_dashboard_kpis").select("*"),
    // Per-day revenue + expenses, last 30 days (we chart the last 7)
    supabase
      .from("v_daily_flow_30d")
      .select("*")
      .order("date", { ascending: true }),
    // Sidebar/alert counts — single cheap row
    supabase.from("v_sidebar_badges").select("*").maybeSingle(),
    // Real cash-drawer discrepancies (over_short is GENERATED, NULL when no float captured)
    supabase
      .from("closings")
      .select(
        "id, closing_date, over_short, cash_float_start, cash_float_end, cash_total",
      )
      .not("over_short", "is", null)
      .neq("over_short", 0)
      .order("closing_date", { ascending: false })
      .limit(10),
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

  // --- Month-to-date KPIs + projections (from v_dashboard_kpis) -----------
  type KpiRow = {
    revenue_mtd: number;
    variable_expenses_mtd: number;
    vat_net_mtd: number;
    fixed_monthly: number;
    projected_revenue: number;
    projected_variable: number;
    projected_net: number;
    avg_revenue_7d: number;
    latest_day_revenue: number;
    trend_vs_avg_pct: number | null;
    days_closed_mtd: number;
    days_in_month: number;
    days_elapsed: number;
  };
  const kpis = ((kpisRes.data ?? []) as unknown as KpiRow[])[0] ?? null;

  // --- Daily flow, last 7 days (from v_daily_flow_30d) -------------------
  type FlowRow = {
    date: string;
    revenue: number;
    expenses: number;
    is_weekend: boolean;
  };
  const flowAll = (dailyFlowRes.data ?? []) as unknown as FlowRow[];
  const flow7 = flowAll.slice(-7);
  const flowMax = Math.max(1, ...flow7.map((d) => Number(d.revenue)));
  const flowHasData = flow7.some((d) => Number(d.revenue) > 0);

  // --- Alert counts (from v_sidebar_badges) -----------------------------
  type BadgeRow = {
    pending_count: number;
    uncategorized_count: number;
    open_liabilities_count: number;
    missing_float_count: number;
    missing_trn_count: number;
  };
  const badges = (badgesRes.data as BadgeRow | null) ?? {
    pending_count: 0,
    uncategorized_count: 0,
    open_liabilities_count: 0,
    missing_float_count: 0,
    missing_trn_count: 0,
  };

  // --- Real cash-drawer discrepancies (over_short <> 0) ------------------
  type CashDiscRow = {
    id: string;
    closing_date: string;
    over_short: number;
    cash_float_start: number | null;
    cash_float_end: number | null;
    cash_total: number;
  };
  const cashDiscrepancies = (cashDiscRes.data ?? []) as unknown as CashDiscRow[];

  type Alert = {
    key: string;
    href: Route;
    count?: number;
    text: string;
    tone: "warn" | "info";
  };
  const alerts: Alert[] = [];
  if (badges.pending_count > 0)
    alerts.push({
      key: "pending",
      href: "/owner/review",
      count: badges.pending_count,
      text: tr("dash.alerts.pending", locale),
      tone: "warn",
    });
  for (const d of cashDiscrepancies) {
    const amount = Number(d.over_short);
    alerts.push({
      key: `cash-${d.id}`,
      href: "/owner/closings",
      text:
        (amount < 0
          ? tr("dash.alerts.cash_short", locale)
          : tr("dash.alerts.cash_over", locale)) +
        ` ${d.closing_date} — ${aed(Math.abs(amount))}`,
      tone: "warn",
    });
  }
  if (badges.uncategorized_count > 0)
    alerts.push({
      key: "uncategorized",
      href: "/owner/expenses",
      count: badges.uncategorized_count,
      text: tr("dash.alerts.uncategorized", locale),
      tone: "info",
    });
  if (badges.missing_float_count > 0)
    alerts.push({
      key: "missing_float",
      href: "/owner/closings",
      count: badges.missing_float_count,
      text: tr("dash.alerts.missing_float", locale),
      tone: "info",
    });
  if (badges.missing_trn_count > 0)
    alerts.push({
      key: "missing_trn",
      href: "/owner/suppliers",
      count: badges.missing_trn_count,
      text: tr("dash.alerts.missing_trn", locale),
      tone: "info",
    });
  if (badges.open_liabilities_count > 0)
    alerts.push({
      key: "open_liabilities",
      href: "/owner/liabilities",
      count: badges.open_liabilities_count,
      text: tr("dash.alerts.open_liabilities", locale),
      tone: "info",
    });

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

      {/* Hero — month-to-date result + projection */}
      {kpis && (
        <section className="mb-8 rounded-2xl border border-neutral-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                {tr("dash.hero.projected_net", locale)}
              </p>
              <p
                className={`mt-1 text-4xl font-light tabular-nums ${
                  Number(kpis.projected_net) < 0
                    ? "text-red-600"
                    : "text-strow-ink"
                }`}
              >
                {aed(Number(kpis.projected_net))}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                {tr("dash.hero.basis", locale)} · {kpis.days_closed_mtd}/
                {kpis.days_in_month} {tr("dash.hero.days_closed", locale)}
              </p>
            </div>
            {kpis.trend_vs_avg_pct != null && (
              <TrendPill
                pct={Number(kpis.trend_vs_avg_pct)}
                locale={locale}
              />
            )}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat
              label={tr("dash.hero.revenue_mtd", locale)}
              value={aed(Number(kpis.revenue_mtd))}
            />
            <MiniStat
              label={tr("dash.hero.variable_mtd", locale)}
              value={aed(Number(kpis.variable_expenses_mtd))}
            />
            <MiniStat
              label={tr("dash.hero.fixed_monthly", locale)}
              value={aed(Number(kpis.fixed_monthly))}
            />
            <MiniStat
              label={tr("dash.hero.vat_net", locale)}
              value={aed(Number(kpis.vat_net_mtd))}
            />
          </div>
        </section>
      )}

      {/* Needs your eyes — actionable alerts */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-neutral-700">
          {tr("dash.alerts.title", locale)}
        </h2>
        {alerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-6 text-center text-sm text-emerald-700">
            {tr("dash.alerts.all_clear", locale)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {alerts.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-0 hover:bg-neutral-50"
              >
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${
                    a.tone === "warn" ? "bg-red-500" : "bg-amber-400"
                  }`}
                />
                {a.count != null && (
                  <span className="min-w-[1.5rem] tabular-nums text-sm font-medium">
                    {a.count}
                  </span>
                )}
                <span className="flex-1 text-sm text-neutral-700">
                  {a.text}
                </span>
                <span className="text-neutral-300" aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Last 7 days — daily revenue flow */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium text-neutral-700">
          {tr("dash.chart.title", locale)}
        </h2>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          {flowHasData ? (
            <>
              <div className="flex h-44 items-end gap-2">
                {flow7.map((d) => {
                  const rev = Number(d.revenue);
                  const pct =
                    rev > 0
                      ? Math.min(
                          Math.max(Math.round((rev / flowMax) * 85), 4),
                          85,
                        )
                      : 0;
                  return (
                    <div
                      key={d.date}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                      title={`${d.date} — ${aed(rev)}`}
                    >
                      <span className="text-[10px] tabular-nums text-neutral-400">
                        {rev > 0 ? Math.round(rev) : ""}
                      </span>
                      <div
                        className={`w-full rounded-t ${
                          d.is_weekend ? "bg-strow-ink/40" : "bg-strow-ink"
                        }`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-2">
                {flow7.map((d) => (
                  <span
                    key={d.date}
                    className="flex-1 text-center text-[10px] tabular-nums text-neutral-500"
                  >
                    {d.date.slice(5)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-neutral-500">
              {tr("dash.chart.no_data", locale)}
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-400">
            {tr("dash.chart.caption", locale)}
          </p>
        </div>
      </section>

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
