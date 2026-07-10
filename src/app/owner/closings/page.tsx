import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { RowActions } from "@/components/owner/RowActions";
import { Suspense } from "react";
import { TableFilters } from "@/components/owner/TableFilters";
import { parseFilters } from "@/lib/filters";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import { StatusPill } from "@/components/owner/StatusPill";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClosingRow = {
  id: string;
  closing_date: string;
  cash_total: number;
  card_total: number;
  online_total: number;
  grand_total: number;
  status: string;
  notes: string | null;
  photo_drive_url: string | null;
  baristas: { name: string } | null;
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700",
  pending_review: "bg-amber-50 text-amber-700",
  flagged: "bg-red-50 text-red-700",
  rejected: "bg-neutral-100 text-neutral-500",
};

function formatAed(n: number | null | undefined) {
  if (n == null) return "AED -";
  return `AED ${Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-AE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function addDaysUTC(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Days with no sales closing, from when regular recording began up to
// yesterday. A rolling window keeps a stray old entry from flagging long
// dormant periods (e.g. a lone test day a year before daily tracking started).
function computeMissingDays(recorded: string[], todayIso: string, windowDays = 120): string[] {
  const set = new Set(recorded);
  const windowStart = addDaysUTC(todayIso, -windowDays);
  const inWindow = recorded.filter((d) => d >= windowStart).sort();
  if (inWindow.length === 0) return [];
  const yesterday = addDaysUTC(todayIso, -1);
  const missing: string[] = [];
  for (let d = inWindow[0]; d <= yesterday; d = addDaysUTC(d, 1)) {
    if (!set.has(d)) missing.push(d);
  }
  return missing;
}

// Collapse consecutive dates into ranges for compact display.
function groupRanges(dates: string[]): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  for (const d of dates) {
    const last = out[out.length - 1];
    if (last && addDaysUTC(last.end, 1) === d) last.end = d;
    else out.push({ start: d, end: d });
  }
  return out;
}

export default async function OwnerSalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const locale = await getLocale();

  const supabase = createServiceClient();
  let query = supabase
    .from("closings")
    .select(
      "id, closing_date, cash_total, card_total, online_total, grand_total, status, notes, photo_drive_url, baristas(name)",
    )
    .order("closing_date", { ascending: false })
    .limit(200);

  if (filters.from) query = query.gte("closing_date", filters.from);
  if (filters.to) query = query.lte("closing_date", filters.to);
  if (filters.statuses.length > 0) query = query.in("status", filters.statuses);

  const { data, error } = await query;
  let closings = (data ?? []) as unknown as ClosingRow[];

  // Free-text filter applied in JS over barista name + notes
  if (filters.q) {
    const q = filters.q.toLowerCase();
    closings = closings.filter(
      (c) =>
        (c.baristas?.name || "").toLowerCase().includes(q) ||
        (c.notes || "").toLowerCase().includes(q),
    );
  }

  const grandSum = closings.reduce(
    (sum, c) => sum + Number(c.grand_total ?? 0),
    0,
  );

  // Missing-day alarm — runs over ALL closings (ignores the current filter).
  const { data: allDates } = await supabase
    .from("closings")
    .select("closing_date")
    .order("closing_date", { ascending: true });
  const recordedDates = Array.from(
    new Set(((allDates ?? []) as { closing_date: string }[]).map((r) => r.closing_date)),
  );
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  const missingDays = computeMissingDays(recordedDates, todayIso);
  const missingRanges = groupRanges(missingDays);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">{tr("page.sales", locale)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {closings.length} {tr("summary.sales_count", locale)} - {formatAed(grandSum)} {tr("summary.total_label", locale)}
          </p>
        </div>
      </header>

      {missingDays.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">
            {missingDays.length} {missingDays.length === 1 ? "day is" : "days are"} missing a sales closing
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missingRanges.map((r) => (
              <span
                key={r.start}
                className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800"
              >
                {r.start === r.end ? formatDate(r.start) : `${formatDate(r.start)} – ${formatDate(r.end)}`}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-amber-700">
            Days between your first recorded closing and yesterday with nothing entered. Add them, or ignore any day the café was genuinely closed.
          </p>
        </div>
      )}

      <Suspense fallback={null}><TableFilters searchPlaceholder={tr("filter.search.barista_or_note", locale)} /></Suspense>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load sales: {error.message}
        </div>
      ) : closings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            {tr("summary.no_match", locale)}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {closings.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={c.status} locale={locale} />
                  </div>
                  <p className="mt-2 text-base font-medium">
                    {formatDate(c.closing_date)} -{" "}
                    {formatAed(c.grand_total)}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {tr("card.cash", locale)} {formatAed(c.cash_total)} - {tr("card.card", locale)} {formatAed(c.card_total)} - {tr("card.online", locale)} {formatAed(c.online_total)} - {tr("card.by", locale)} {c.baristas?.name ?? "-"}
                  </p>
                  {c.notes && (
                    <p className="mt-2 text-xs italic text-neutral-500">
                      {c.notes}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <RowActions
                  type="closing"
                  id={c.id}
                  status={c.status}
                  photoDriveUrl={c.photo_drive_url}
                  fields={{
                    closing_date: c.closing_date,
                    cash_total: Number(c.cash_total),
                    card_total: Number(c.card_total),
                    online_total: Number(c.online_total),
                    notes: c.notes,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">
          {tr("common.dashboard", locale)}
        </Link>
      </p>
    </div>
  );
}
