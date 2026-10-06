import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { getLocale } from "@/lib/i18n/locale";
import { PeriodPicker, ReportToolbar } from "@/components/owner/PeriodPicker";
import {
  addDays,
  addMonths,
  billsText,
  dayLabel,
  daysInclusive,
  daysText,
  fmtAed,
  fmtPct,
  fmtSigned,
  groupLabel,
  loadMonthlyTrend,
  loadPnl,
  loadPnlContext,
  monthEnd,
  monthLabel,
  monthName,
  monthOf,
  monthStart,
  rangeLabel,
  resolvePeriod,
  statementLines,
  type Pnl,
  type PnlContext,
  type PnlLocale,
  type PnlPeriod,
  type StatementLine,
  type TrendRow,
} from "@/lib/reports/pnl";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const RED = "text-[#B42318]";
const GREEN = "text-[#0A6B34]";
const CARD = "rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]";

/** Numbers keep their order (and minus sign) inside Arabic text. */
function Num({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={`tabular-nums ${className}`}>
      {children}
    </span>
  );
}

export default async function ProfitAndLossPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const ar = locale === "ar";
  const ctx = await loadPnlContext();
  const year = ctx.today.slice(0, 4);
  const curMonth = monthOf(ctx.today);
  const period = resolvePeriod({ m: param(sp.m), from: param(sp.from), to: param(sp.to) }, ctx.today);

  // 7 months so the oldest chip still has its previous month for the comparison.
  const [p, trend7] = await Promise.all([loadPnl(period.from, period.to, ctx), loadMonthlyTrend(curMonth, 7, ctx)]);
  const trend = trend7.slice(-6);
  const compare = await previousMonth(period, p, trend7, ctx, locale);
  const lines = statementLines(p, locale);
  const footnote = proratingNote(p, ctx, locale);
  const activeMonth = period.kind === "month" ? period.month : null;

  const pickerTo = period.kind === "month" && period.to > ctx.today ? ctx.today : period.to;
  const csvHref =
    period.kind === "month" && period.month
      ? `/api/reports/monthly-pnl/csv?m=${period.month}`
      : `/api/reports/monthly-pnl/csv?from=${period.from}&to=${period.to}`;
  const chipLabel = (r: TrendRow) =>
    `${monthName(r.month, locale, true)}${r.month.slice(0, 4) !== year ? ` ${r.month.slice(2, 4)}` : ""}${r.partial ? "*" : ""}`;
  const delta = compare ? p.netProfit - compare.profit : null;
  const empty = p.closingDays === 0 && p.purchases.count === 0;

  return (
    <div className="page flex flex-col gap-4 md:gap-5">
      <header className="flex flex-col gap-1 px-1">
        <span className={ar ? "text-xs font-semibold text-neutral-500" : "text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500"}>
          {ar ? "التقارير" : "Reports"}
        </span>
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{ar ? "الأرباح والخسائر" : "Profit & loss"}</h1>
        <p className="text-sm text-neutral-500">
          {ar
            ? "المبيعات من إقفالات الباريستا، والتكاليف من الفواتير والمصاريف الثابتة"
            : "Sales from barista closings, costs from bills and recurring costs"}
        </p>
      </header>

      {/* Month chips (newest first, so this month and last month never start scrolled away) + custom range */}
      <div className="flex flex-col gap-2 print:hidden xl:flex-row xl:items-center xl:justify-between">
        <nav aria-label={ar ? "الأشهر" : "Months"} className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
          <div className="inline-flex gap-1 rounded-full bg-white/70 p-1">
            {[...trend].reverse().map((r) => {
              const on = r.month === activeMonth;
              return (
                <Link
                  key={r.month}
                  href={`/owner/reports?m=${r.month}` as Route}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-3 text-sm transition ${
                    on ? "bg-strow-ink font-semibold text-white" : "text-neutral-600 hover:text-strow-ink"
                  }`}
                >
                  {chipLabel(r)}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="max-sm:[&_label]:hidden [&>div]:mb-0 [&_input]:min-h-11 [&_input]:rounded-full">
          <PeriodPicker key={`${period.from}|${pickerTo}`} defaultFrom={period.from} defaultTo={pickerTo} />
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1">
        <h2 className="font-display text-lg font-semibold">
          {period.kind === "month" && period.month ? monthLabel(period.month, locale) : rangeLabel(period.from, period.to, locale, true)}
        </h2>
        <span className="text-[13px] text-neutral-500">{periodNote(period, p, ctx, locale)}</span>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-[18px]">
        <Tile label={ar ? "صافي المبيعات" : "Net sales"} value={fmtAed(p.net)}>
          {ar ? `بعد خصم الضريبة · ${daysText(p.daysCovered, "ar")}` : `After VAT · ${daysText(p.daysCovered, "en")}`}
        </Tile>
        <Tile label={ar ? "الربح الإجمالي" : "Gross profit"} value={fmtSigned(p.gross)}>
          <Num>{fmtPct(p.grossPct)}</Num>
          {ar ? " من الصافي، بعد الفواتير" : " of net, after bills"}
        </Tile>
        <Tile label={ar ? "صافي الربح" : "Net profit"} value={fmtSigned(p.netProfit)} tone={p.netProfit < 0 ? RED : ""}>
          <Num>{fmtPct(p.netPct)}</Num>
          {ar ? " من الصافي" : " of net"}
          {compare && delta != null ? (
            <span className="block">
              <Num className={`font-semibold ${delta < 0 ? RED : GREEN}`}>{fmtSigned(delta, true)}</Num>
              {ar ? ` عن ${compare.label}` : ` vs ${compare.label}`}
            </span>
          ) : null}
        </Tile>
        <Tile label={ar ? "تكلفة المواد من الفواتير" : "Food cost from bills"} value={fmtPct(p.foodCostBills)}>
          {ar ? (
            <>
              مشتريات طعام ومشروبات <Num>{fmtAed(p.purchases.food)}</Num>
            </>
          ) : (
            <>
              <Num>AED {fmtAed(p.purchases.food)}</Num> of food and drink bills
            </>
          )}
        </Tile>
      </div>

      <div className="grid gap-4 md:gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        {/* Statement */}
        <section className={`${CARD} flex flex-col`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 pb-3">
            <h2 className="font-display text-lg font-semibold">{ar ? "البيان" : "Statement"}</h2>
            <span className="text-xs text-neutral-500">{ar ? "AED · النسبة من صافي المبيعات" : "AED · % of net sales"}</span>
          </div>
          {empty ? (
            <p className="pb-3 text-sm text-neutral-500">
              {ar ? "لا توجد إقفالات أو فواتير مؤكدة في هذه الفترة." : "No confirmed closings or bills in this period."}
            </p>
          ) : null}
          <div>
            {lines.map((l) => (
              <StatementRow key={l.key} line={l} />
            ))}
          </div>
          {footnote ? <p className="pt-3 text-xs leading-relaxed text-neutral-500">{footnote}</p> : null}
          {p.purchases.byCategory.length ? (
            <details className="group mt-3 border-t border-[#EDF0F3]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-neutral-700 [&::-webkit-details-marker]:hidden">
                <span>
                  {ar ? "الفواتير حسب الفئة" : "Bills by category"} · {billsText(p.purchases.count, locale)}
                </span>
                <span aria-hidden className="text-neutral-400 transition group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <ul className="flex flex-col pb-1">
                {p.purchases.byCategory.map((c) => (
                  <li key={c.name ?? "-"} className="flex items-baseline gap-3 border-t border-[#EDF0F3] py-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px]">{c.name ?? (ar ? "بدون فئة" : "Uncategorized")}</span>
                      <span className="text-xs text-neutral-500">
                        {groupLabel(c.group, locale)} · {billsText(c.count, locale)}
                      </span>
                    </span>
                    <Num className="shrink-0 text-[13px]">{fmtAed(c.amount)}</Num>
                  </li>
                ))}
              </ul>
              <p className="pb-1 text-xs text-neutral-500">{ar ? "المبالغ قبل الضريبة." : "Amounts before VAT."}</p>
            </details>
          ) : null}
        </section>

        <div className="grid content-start gap-4 md:grid-cols-2 md:gap-[18px] xl:grid-cols-1">
          <FoodCostCard p={p} ctx={ctx} locale={locale} />
          <NotCountedCard p={p} locale={locale} />
        </div>
      </div>

      {/* Profit by month */}
      <section className={`${CARD} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-display text-lg font-semibold">{ar ? "الربح حسب الشهر" : "Profit by month"}</h2>
          <span className="flex flex-wrap gap-x-3 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-[2px] bg-strow-blue" />
              {ar ? "ربح" : "Profit"}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-[2px] bg-[#B42318]" />
              {ar ? "خسارة" : "Loss"}
            </span>
            {trend.some((r) => r.partial) ? <span>{ar ? "* جزء من الشهر" : "* part month"}</span> : null}
          </span>
        </div>
        <ProfitBars rows={trend} active={activeMonth} locale={locale} year={year} />
        <p className="text-xs text-neutral-500">
          {ar ? "تحت كل شهر: صافي المبيعات. اضغط على الشهر لفتحه." : "Under each month: net sales. Tap a month to open it."}
        </p>
      </section>

      <footer className="flex flex-col gap-1 px-1 print:hidden md:flex-row md:items-center md:justify-between">
        <div className="[&>div]:mb-0 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded-full [&_a]:px-4 [&_button]:min-h-11 [&_button]:rounded-full [&_button]:px-4">
          <ReportToolbar csvHref={csvHref} />
        </div>
        <nav className="flex flex-wrap gap-x-5">
          <Link
            href={`/owner/reports/category-breakdown?from=${period.from}&to=${pickerTo}` as Route}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-strow-blue"
          >
            {ar ? "الإنفاق حسب الفئة ‹" : "Spend by category ›"}
          </Link>
          <Link href="/owner/reports/vat" className="inline-flex min-h-11 items-center text-sm font-semibold text-strow-blue">
            {ar ? "تقرير الضريبة ‹" : "VAT report ›"}
          </Link>
        </nav>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Tile({ label, value, tone = "", children }: { label: string; value: string; tone?: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-3xl bg-white p-4">
      <span className="text-[13px] text-neutral-500">{label}</span>
      <span className={`font-display text-[26px] font-bold leading-tight tracking-[-0.5px] ${tone}`}>
        <Num>{value}</Num>
      </span>
      {children ? <span className="text-xs leading-snug text-neutral-500">{children}</span> : null}
    </div>
  );
}

function StatementRow({ line }: { line: StatementLine }) {
  const strong = line.kind !== "line";
  const tone = line.kind === "result" ? (line.amount < 0 ? RED : GREEN) : "";
  return (
    <div
      className={`flex items-baseline gap-3 border-t border-[#EDF0F3] py-2.5 ${
        strong ? "-mx-[18px] bg-[#F4F5F7] px-[18px] font-bold md:-mx-[22px] md:px-[22px]" : ""
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[15px] ${strong ? "" : "text-neutral-700"}`}>{line.label}</span>
        {line.note ? <span className="text-xs font-normal text-neutral-500">{line.note}</span> : null}
      </span>
      <span dir="ltr" className={`shrink-0 text-[15px] tabular-nums ${tone}`}>
        {fmtSigned(line.amount)}
      </span>
      <span dir="ltr" className={`w-[52px] shrink-0 text-end text-xs tabular-nums ${tone || "text-neutral-500"}`}>
        {line.pct == null ? "" : fmtPct(line.pct)}
      </span>
    </div>
  );
}

function Meter({ label, value, bar, children }: { label: string; value: number | null; bar: string; children: ReactNode }) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, value * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="font-display text-xl font-bold">
          <Num>{fmtPct(value)}</Num>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#EEF0F3]">
        <div className={`pulse-fill h-2 rounded-full ${bar}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs leading-snug text-neutral-500">{children}</span>
    </div>
  );
}

function FoodCostCard({ p, ctx, locale }: { p: Pnl; ctx: PnlContext; locale: PnlLocale }) {
  const ar = locale === "ar";
  const r = p.foodCostRecipes;
  const recipesTitle = ar ? "من الوصفات ومبيعات نقطة البيع" : "From recipes and POS sales";
  return (
    <section className={`${CARD} flex flex-col gap-4`}>
      <h2 className="font-display text-lg font-semibold">{ar ? "تكلفة المواد" : "Food cost"}</h2>
      <Meter label={ar ? "من الفواتير" : "From bills"} value={p.foodCostBills} bar="bg-strow-ink">
        {ar ? "مشتريات الطعام والمشروبات ÷ صافي المبيعات" : "Food and drink bought ÷ net sales"}
      </Meter>
      {r && r.pct != null ? (
        <Meter label={recipesTitle} value={r.pct} bar="bg-strow-blue">
          {ar ? "تكلفة وصفات ما بيع ÷ مبيعاته قبل الضريبة · الوصفات تغطي " : "Recipe cost of what sold ÷ those sales before VAT · recipes cover "}
          <Num>{fmtPct(r.coverage, 0)}</Num>
          {ar ? ` من مبيعات نقطة البيع · بيانات ${daysText(r.days, "ar")}` : ` of POS sales · ${daysText(r.days, "en")} of POS reports`}
        </Meter>
      ) : (
        <div className="flex flex-col gap-1 rounded-2xl bg-[#F4F5F7] px-3.5 py-3">
          <span className="text-[13px] font-semibold">{recipesTitle}</span>
          <span className="text-[13px] leading-snug text-neutral-500">
            {r
              ? ar
                ? "لم تُربط أي مبيعات من نقطة البيع بوصفة بعد."
                : "No POS sales are matched to a recipe yet."
              : ar
                ? "لا توجد تقارير نقطة البيع في هذه الفترة."
                : "No POS reports in this period."}
            {!r && ctx.firstPosDay
              ? ar
                ? ` التقارير تبدأ ${dayLabel(ctx.firstPosDay, "ar", true)}، ويمكن رفع الأيام الأقدم.`
                : ` They start ${dayLabel(ctx.firstPosDay, "en", true)}; older days can be uploaded.`
              : ""}
          </span>
        </div>
      )}
      {p.foodCostBills != null && r?.pct != null ? (
        <p className="text-xs leading-snug text-neutral-500">
          {ar
            ? "الفرق بين الرقمين عادةً سببه الهدر أو مشروبات الموظفين أو تراكم المخزون أو وصفات ناقصة."
            : "A gap between the two usually means waste, staff drinks, stock building up, or recipes that miss items."}
        </p>
      ) : null}
    </section>
  );
}

function NotCountedCard({ p, locale }: { p: Pnl; locale: PnlLocale }) {
  const ar = locale === "ar";
  const items: { key: string; title: string; body: ReactNode }[] = [];

  if (p.apps.total >= 0.5) {
    const split = [
      { k: "talabat", label: ar ? "طلبات" : "Talabat", v: p.apps.talabat },
      { k: "keeta", label: ar ? "كيتا" : "Keeta", v: p.apps.keeta },
      { k: "beanz", label: "Beanz", v: p.apps.beanz },
      { k: "unsplit", label: ar ? "غير مفصّلة" : "not split", v: p.apps.unsplit },
    ].filter((s) => s.v >= 0.5);
    const hasSplit = p.apps.talabat + p.apps.keeta + p.apps.beanz >= 0.5;
    items.push({
      key: "apps",
      title: ar ? "عمولات التطبيقات" : "App commissions",
      body: (
        <>
          <Num>AED {fmtAed(p.apps.total)}</Num> = <Num>{fmtPct(p.apps.share)}</Num>
          {ar ? " من المبيعات جاءت عبر التطبيقات" : " of sales came through apps"}
          {hasSplit ? (
            <>
              {" ("}
              {split.map((s, i) => (
                <span key={s.k}>
                  {i ? " · " : ""}
                  {s.label} <Num>{fmtAed(s.v)}</Num>
                </span>
              ))}
              {")"}
            </>
          ) : null}
          {ar
            ? ". عمولاتها غير مسجلة في Strow بعد، لذلك الربح الحقيقي أقل."
            : ". Their commissions aren't in Strow yet, so real profit is lower."}
        </>
      ),
    });
  }

  if (p.daysCovered > 0 && p.utilityBills < 2 && !p.utilityRecurring) {
    items.push({
      key: "utilities",
      title: ar ? "الكهرباء والماء" : "Electricity and water",
      body:
        p.utilityBills === 0
          ? ar
            ? "لا توجد فاتورة كهرباء أو ماء في هذه الفترة."
            : "No electricity or water bill in this period."
          : ar
            ? "فاتورة كهرباء أو ماء واحدة فقط في هذه الفترة."
            : "Only one electricity or water bill in this period.",
    });
  }

  items.push({
    key: "stock",
    title: ar ? "مشتريات بدون فاتورة" : "Stock without a bill",
    body: ar
      ? "أي شيء اشتُري بدون فاتورة — مشتريات نقدية أو أغراض من البيت — غير محسوب."
      : "Anything bought without a bill — cash buys, things brought from home — isn't counted.",
  });

  return (
    <section className={`${CARD} flex flex-col`}>
      <h2 className="pb-2 font-display text-lg font-semibold">{ar ? "غير محسوب بعد" : "Not counted yet"}</h2>
      <ul className="flex flex-col">
        {items.map((it) => (
          <li key={it.key} className="flex gap-3 border-t border-[#EDF0F3] py-3">
            <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-strow-amber" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{it.title}</span>
              <span className="text-[13px] leading-snug text-neutral-500">{it.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Two-sided bars: profit above the zero line (blue), loss below (red). Each month links to its P&L. */
function ProfitBars({ rows, active, locale, year }: { rows: TrendRow[]; active: string | null; locale: PnlLocale; year: string }) {
  const ar = locale === "ar";
  const AREA = 120; // px shared by profit and loss
  const LABEL = 18; // room for the value next to the bar
  const up = Math.max(0, ...rows.map((r) => r.profit));
  const down = Math.max(0, ...rows.map((r) => -r.profit));
  const span = up + down;
  if (span < 1) {
    return <p className="py-6 text-center text-sm text-neutral-500">{ar ? "لا توجد بيانات لهذه الأشهر بعد." : "No data for these months yet."}</p>;
  }
  const upH = up >= 0.5 ? Math.max(6, Math.round((AREA * up) / span)) : 0;
  const downH = down >= 0.5 ? Math.max(6, Math.round((AREA * down) / span)) : 0;
  const barH = (v: number) => Math.max(3, Math.round((AREA * Math.abs(v)) / span));

  return (
    <div className="-mx-[18px] overflow-x-auto px-[18px] [scrollbar-width:none] md:-mx-[22px] md:px-[22px]">
      <div className="flex">
        {rows.map((r, i) => {
          const on = r.month === active;
          const name = `${monthName(r.month, locale, true)}${r.month.slice(0, 4) !== year ? ` ${r.month.slice(2, 4)}` : ""}${r.partial ? "*" : ""}`;
          const summary = ar
            ? `${monthLabel(r.month, "ar")}${r.partial ? " (جزء من الشهر)" : ""}: صافي الربح ${fmtSigned(r.profit)} · صافي المبيعات ${fmtAed(r.net)} · الربح الإجمالي ${fmtSigned(r.gross)} · المصاريف الثابتة ${fmtAed(r.recurring)}`
            : `${monthLabel(r.month, "en")}${r.partial ? " (part month)" : ""}: net profit ${fmtSigned(r.profit)} · net sales ${fmtAed(r.net)} · gross profit ${fmtSigned(r.gross)} · recurring ${fmtAed(r.recurring)}`;
          const delay = { animationDelay: `${i * 70}ms` };
          return (
            <Link
              key={r.month}
              href={`/owner/reports?m=${r.month}` as Route}
              aria-current={on ? "page" : undefined}
              aria-label={summary}
              title={summary}
              className={`flex min-w-[52px] flex-1 flex-col items-center rounded-2xl pb-2 pt-2 transition hover:bg-neutral-50 active:bg-neutral-100 ${
                on ? "bg-[#F4F5F7]" : ""
              }`}
            >
              {upH ? (
                <span className="flex w-full flex-col items-center justify-end" style={{ height: upH + LABEL }}>
                  {r.profit >= 0.5 ? (
                    <>
                      <span dir="ltr" className="pb-1 text-[11px] font-semibold leading-none tabular-nums text-strow-blue">
                        {fmtAed(r.profit)}
                      </span>
                      <span
                        className={`pulse-bar block w-6 rounded-t-md bg-strow-blue md:w-8 ${r.partial ? "opacity-60" : ""}`}
                        style={{ height: barH(r.profit), ...delay }}
                      />
                    </>
                  ) : null}
                </span>
              ) : null}
              <span aria-hidden className="block h-px w-full bg-neutral-300" />
              {downH ? (
                <span className="flex w-full flex-col items-center justify-start" style={{ height: downH + LABEL }}>
                  {r.profit <= -0.5 ? (
                    <>
                      <span
                        className={`pulse-bar block w-6 rounded-b-md bg-[#B42318] md:w-8 ${r.partial ? "opacity-60" : ""}`}
                        style={{ height: barH(r.profit), transformOrigin: "top", ...delay }}
                      />
                      <span dir="ltr" className="pt-1 text-[11px] font-semibold leading-none tabular-nums text-[#B42318]">
                        {fmtSigned(r.profit)}
                      </span>
                    </>
                  ) : null}
                </span>
              ) : null}
              <span className={`mt-2 text-xs ${on ? "font-bold" : "font-semibold"}`}>{name}</span>
              <span dir="ltr" className="text-[11px] tabular-nums text-neutral-500">
                {r.hasData ? fmtAed(r.net) : "—"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ helpers

type Compare = { profit: number; label: string };

/**
 * Month view only. A full month is compared with the whole previous month; this month so far
 * is compared with the same days of last month (1–5 Oct vs 1–5 Sep), so a part month never
 * looks worse just because it is shorter.
 */
async function previousMonth(period: PnlPeriod, p: Pnl, trend: TrendRow[], ctx: PnlContext, locale: PnlLocale): Promise<Compare | null> {
  if (period.kind !== "month" || !period.month || !p.counted) return null;
  const prev = addMonths(period.month, -1);
  if (p.daysCovered === p.daysInPeriod) {
    const row = trend.find((r) => r.month === prev) ?? (await loadMonthlyTrend(prev, 1, ctx))[0];
    if (!row || row.daysCovered === 0) return null;
    return { profit: row.profit, label: `${monthName(prev, locale, true)}${row.partial ? "*" : ""}` };
  }
  if (p.counted.start !== period.from) return null; // the month the data starts: nothing before it
  const from = monthStart(prev);
  const sameDay = addDays(from, p.daysCovered - 1);
  const to = sameDay < monthEnd(prev) ? sameDay : monthEnd(prev);
  const q = await loadPnl(from, to, ctx);
  if (q.daysCovered !== daysInclusive(from, to)) return null;
  // "vs 1–5 Sep" / "عن نفس الأيام من سبتمبر"
  return { profit: q.netProfit, label: locale === "ar" ? `نفس الأيام من ${monthName(prev, "ar")}` : rangeLabel(from, to, "en") };
}

function periodNote(period: PnlPeriod, p: Pnl, ctx: PnlContext, locale: PnlLocale): string {
  const ar = locale === "ar";
  if (!p.counted) {
    if (ctx.firstClosing && period.from > ctx.asOf) return ar ? "لا توجد أيام مُقفلة بعد" : "No closed days yet";
    return ar ? "لا توجد بيانات في هذه الفترة" : "No data in this period";
  }
  if (period.kind === "range") return ar ? `فترة مخصصة · ${daysText(p.daysInPeriod, "ar")}` : `Custom range · ${daysText(p.daysInPeriod, "en")}`;
  if (p.daysCovered === p.daysInPeriod) return ar ? `شهر كامل · ${daysText(p.daysInPeriod, "ar")}` : `Full month · ${daysText(p.daysInPeriod, "en")}`;
  if (p.counted.start > period.from) {
    return ar ? `جزء من الشهر · البيانات تبدأ ${dayLabel(p.counted.start, "ar")}` : `Part month · data starts ${dayLabel(p.counted.start, "en")}`;
  }
  return ar
    ? `الشهر حتى الآن · ${rangeLabel(p.counted.start, p.counted.end, "ar")}`
    : `Month to date · ${rangeLabel(p.counted.start, p.counted.end, "en")}`;
}

/** Explains how recurring costs were prorated when a month is only partly counted. */
function proratingNote(p: Pnl, ctx: PnlContext, locale: PnlLocale): string | null {
  const ar = locale === "ar";
  const months = p.recurring.months;
  if (!p.counted || p.recurring.monthly <= 0 || months.every((m) => m.days === m.dim)) return null;
  const pieces = months.map((m) =>
    ar ? `${m.days} من ${m.dim} يوماً من ${monthName(m.month, "ar")}` : `${m.days} of ${m.dim} days of ${monthName(m.month, "en")}`,
  );
  const why: string[] = [];
  if (ctx.firstClosing && p.counted.start === ctx.firstClosing && ctx.firstClosing > p.from) {
    why.push(ar ? `البيانات تبدأ ${dayLabel(ctx.firstClosing, "ar")}` : `the data starts ${dayLabel(ctx.firstClosing, "en")}`);
  }
  if (p.counted.end === ctx.asOf && ctx.asOf < p.to) {
    why.push(
      ctx.asOf === ctx.today
        ? ar
          ? "محسوبة حتى اليوم"
          : "counted up to today"
        : ar
          ? "محسوبة حتى أمس لأن اليوم لم يُقفل بعد"
          : "counted up to yesterday, as today isn't closed yet",
    );
  }
  const monthly = fmtAed(p.recurring.monthly);
  return ar
    ? `المصاريف الثابتة (${monthly} شهرياً) تُحسب باليوم: ${pieces.join(" + ")}${why.length ? ` — ${why.join("، ")}` : ""}.`
    : `Recurring costs (${monthly} a month) are charged by the day: ${pieces.join(" + ")}${why.length ? ` — ${why.join("; ")}` : ""}.`;
}
