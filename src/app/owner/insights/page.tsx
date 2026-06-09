import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import type { Locale } from "@/lib/i18n/dict";
import { Suspense } from "react";
import { TableFilters } from "@/components/owner/TableFilters";
import { parseFilters } from "@/lib/filters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function aed(n: number) {
  return `AED ${Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

// Safe day-of-week from a YYYY-MM-DD date string (0=Sun .. 6=Sat), no TZ drift.
function dowOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

type ClosingRow = {
  closing_date: string;
  cash_total: number;
  card_total: number;
  online_total: number;
  grand_total: number;
};

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
      <p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-light text-strow-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
}

function RecCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-sm font-medium text-strow-ink">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{body}</p>
    </div>
  );
}

export default async function OwnerInsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const locale = await getLocale();
  const params = await searchParams;
  const filters = parseFilters(params);
  const supabase = createServiceClient();

  let query = supabase
    .from("closings")
    .select("closing_date, cash_total, card_total, online_total, grand_total")
    .eq("status", "confirmed")
    .order("closing_date", { ascending: true })
    .limit(1000);

  if (filters.from) query = query.gte("closing_date", filters.from);
  if (filters.to) query = query.lte("closing_date", filters.to);

  const { data, error } = await query;

  const rows = (data ?? []) as unknown as ClosingRow[];

  const dayShort = (i: number) =>
    tr(`insights.day.${i}` as string, locale);

  // --- Aggregates ---------------------------------------------------------
  const total = rows.reduce((s, r) => s + Number(r.grand_total ?? 0), 0);
  const avg = rows.length ? total / rows.length : 0;
  const cash = rows.reduce((s, r) => s + Number(r.cash_total ?? 0), 0);
  const card = rows.reduce((s, r) => s + Number(r.card_total ?? 0), 0);
  const online = rows.reduce((s, r) => s + Number(r.online_total ?? 0), 0);

  let best: ClosingRow | null = null;
  let low: ClosingRow | null = null;
  for (const r of rows) {
    if (!best || Number(r.grand_total) > Number(best.grand_total)) best = r;
    if (!low || Number(r.grand_total) < Number(low.grand_total)) low = r;
  }

  // Day-of-week averages (0=Sun..6=Sat)
  const dowSums = Array(7).fill(0) as number[];
  const dowCounts = Array(7).fill(0) as number[];
  for (const r of rows) {
    const d = dowOf(r.closing_date);
    dowSums[d] += Number(r.grand_total ?? 0);
    dowCounts[d] += 1;
  }
  const dowAvg = dowSums.map((s, i) => (dowCounts[i] ? s / dowCounts[i] : 0));
  const dowMax = Math.max(1, ...dowAvg);

  // Rank days by average to find strongest / weakest (only days with data)
  const ranked = dowAvg
    .map((v, i) => ({ i, v }))
    .filter((x) => dowCounts[x.i] > 0)
    .sort((a, b) => b.v - a.v);
  const top = ranked.slice(0, 2).map((x) => x.i);
  const bottom = ranked.slice(-2).map((x) => x.i);

  // Last 14 days for the trend strip
  const last14 = rows.slice(-14);
  const trendMax = Math.max(1, ...last14.map((r) => Number(r.grand_total)));

  const cardPct = total ? Math.round((card / total) * 100) : 0;
  const onlPct = total ? Math.round((online / total) * 100) : 0;
  const cashPct = total ? Math.round((cash / total) * 100) : 0;

  const best1 = ranked[0];
  const best2 = ranked[1];
  const weak1 = ranked[ranked.length - 1];
  const weak2 = ranked[ranked.length - 2];

  const recVars: Record<string, string> = {
    best: best1 ? dayShort(best1.i) : "-",
    bestAmt: best1 ? aed(best1.v) : "-",
    best2: best2 ? dayShort(best2.i) : "-",
    best2Amt: best2 ? aed(best2.v) : "-",
    weak: weak1 ? dayShort(weak1.i) : "-",
    weakAmt: weak1 ? aed(weak1.v) : "-",
    weak2: weak2 ? dayShort(weak2.i) : "-",
    weak2Amt: weak2 ? aed(weak2.v) : "-",
    cardPct: String(cardPct),
    onlPct: String(onlPct),
    cashPct: String(cashPct),
  };

  const payBars = [
    { key: "card", label: tr("insights.pay.card", locale), val: card, pct: cardPct, cls: "bg-strow-ink" },
    { key: "online", label: tr("insights.pay.online", locale), val: online, pct: onlPct, cls: "bg-strow-ink/60" },
    { key: "cash", label: tr("insights.pay.cash", locale), val: cash, pct: cashPct, cls: "bg-strow-ink/30" },
  ];

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8">
        <h1 className="text-2xl font-light tracking-tight">
          {tr("page.insights", locale)}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {tr("insights.subtitle", locale)}
        </p>
      </header>

      <Suspense fallback={null}>
        <TableFilters showSearch={false} showStatus={false} showDates={true} />
      </Suspense>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load insights: {error.message}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">{tr("insights.empty", locale)}</p>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label={tr("insights.kpi.total", locale)}
              value={aed(total)}
              hint={`${rows.length} ${tr("insights.kpi.days", locale)}`}
            />
            <StatCard
              label={tr("insights.kpi.avg", locale)}
              value={aed(avg)}
              hint={tr("insights.kpi.avg_hint", locale)}
            />
            <StatCard
              label={tr("insights.kpi.best", locale)}
              value={best ? aed(Number(best.grand_total)) : "-"}
              hint={best ? best.closing_date : undefined}
            />
            <StatCard
              label={tr("insights.kpi.lowest", locale)}
              value={low ? aed(Number(low.grand_total)) : "-"}
              hint={low ? low.closing_date : undefined}
            />
          </div>

          {/* Day-of-week averages */}
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-neutral-700">
              {tr("insights.dow.title", locale)}
            </h2>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="flex h-48 items-end gap-2">
                {dowAvg.map((v, i) => {
                  const pct =
                    v > 0
                      ? Math.min(Math.max(Math.round((v / dowMax) * 85), 4), 85)
                      : 0;
                  const cls = top.includes(i)
                    ? "bg-strow-ink"
                    : bottom.includes(i)
                      ? "bg-red-400"
                      : "bg-strow-ink/40";
                  return (
                    <div
                      key={i}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                      title={`${dayShort(i)} — ${aed(v)}`}
                    >
                      <span className="text-[10px] tabular-nums text-neutral-400">
                        {v > 0 ? Math.round(v) : ""}
                      </span>
                      <div
                        className={`w-full rounded-t ${cls}`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-2">
                {dowAvg.map((_, i) => (
                  <span
                    key={i}
                    className="flex-1 text-center text-[10px] text-neutral-500"
                  >
                    {dayShort(i)}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-neutral-400">
                {tr("insights.dow.caption", locale)}
              </p>
            </div>
          </section>

          {/* Payment mix + 14-day trend */}
          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <section>
              <h2 className="mb-3 text-sm font-medium text-neutral-700">
                {tr("insights.pay.title", locale)}
              </h2>
              <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                <div className="space-y-4">
                  {payBars.map((b) => (
                    <div key={b.key}>
                      <div className="mb-1 flex items-baseline justify-between text-sm">
                        <span className="text-neutral-600">{b.label}</span>
                        <span className="tabular-nums text-neutral-500">
                          {aed(b.val)} · {b.pct}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className={`h-full rounded-full ${b.cls}`}
                          style={{ width: `${b.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-neutral-400">
                  {tr("insights.pay.caption", locale)}
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium text-neutral-700">
                {tr("insights.trend.title", locale)}
              </h2>
              <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                <div className="flex h-32 items-end gap-1">
                  {last14.map((r, idx) => {
                    const rev = Number(r.grand_total);
                    const pct = Math.min(
                      Math.max(Math.round((rev / trendMax) * 85), 4),
                      85,
                    );
                    return (
                      <div
                        key={`${r.closing_date}-${idx}`}
                        className="h-full flex-1"
                        title={`${r.closing_date} — ${aed(rev)}`}
                      >
                        <div className="flex h-full flex-col justify-end">
                          <div
                            className="w-full rounded-t bg-strow-ink/70"
                            style={{ height: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-neutral-400">
                  {tr("insights.trend.caption", locale)}
                </p>
              </div>
            </section>
          </div>

          {/* Recommendations */}
          <section className="mb-10">
            <h2 className="mb-3 text-sm font-medium text-neutral-700">
              {tr("insights.recs.title", locale)}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <RecCard
                title={tr("insights.rec.staffing.title", locale)}
                body={fill(tr("insights.rec.staffing.body", locale), recVars)}
              />
              <RecCard
                title={tr("insights.rec.weakdays.title", locale)}
                body={fill(tr("insights.rec.weakdays.body", locale), recVars)}
              />
              <RecCard
                title={tr("insights.rec.ticket.title", locale)}
                body={fill(tr("insights.rec.ticket.body", locale), recVars)}
              />
              <RecCard
                title={tr("insights.rec.customers.title", locale)}
                body={fill(tr("insights.rec.customers.body", locale), recVars)}
              />
            </div>
          </section>
        </>
      )}

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">
          {tr("common.dashboard", locale)}
        </Link>
      </p>
    </div>
  );
}
