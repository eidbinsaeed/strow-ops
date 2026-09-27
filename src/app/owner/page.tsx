import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { CashControls } from "@/components/owner/CashControls";
import { CountUpText } from "@/components/ai/CountUp";
import { MonthStrip, type StripDay } from "@/components/pulse/MonthStrip";
import { Sparkle } from "@/components/pulse/icons";
import { todayDubai } from "@/lib/dates";

export const dynamic = "force-dynamic";

type Num = number | string | null;
type Kpis = { projected_net: Num; revenue_mtd: Num; fixed_monthly: Num };
type CashPos = {
  cash_on_hand: Num;
  cash_in_today: Num;
  cash_out_today: Num;
  cash_withdrawn_today: Num;
  anchor_date: string | null;
  needs_opening_count: boolean | number | null;
};
type Closing = { closing_date: string; grand_total: Num; cash_total: Num; card_total: Num; online_total: Num; talabat_total: Num; keeta_total: Num; beanz_total: Num };
type Finding = { id: string; status: string; severity: string; title: string; detail: string | null; ops: unknown[] | null };

const N = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WD_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayLong(iso: string, ar: boolean): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return ar
    ? `${WD_AR[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]}`
    : `${WD[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const RANK: Record<string, number> = { critical: 0, warn: 1, info: 2 };
const TAG: Record<string, string> = {
  blue: "bg-[#E3EAFB] text-[#1A3FA8]",
  red: "bg-[#FBE9E7] text-[#9A1B12]",
  grey: "bg-[#EEF0F3] text-[#3F4A57]",
};

export default async function PulsePage() {
  const locale = await getLocale();
  const ar = locale === "ar";
  const db = createServiceClient();
  const today = todayDubai();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const todayNum = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthPrefix = today.slice(0, 8);
  const monthName = ar ? MONTHS_AR[m - 1] : MONTHS[m - 1];

  const [kpiRes, cashRes, closRes, lastRes, findRes, badgeRes, itemsRes] = await Promise.all([
    db.from("v_dashboard_kpis").select("*").limit(1),
    db.from("v_cash_position").select("*").limit(1),
    db
      .from("closings")
      .select("closing_date, grand_total, cash_total, card_total, online_total, talabat_total, keeta_total, beanz_total")
      .gte("closing_date", addDays(today, -120))
      .lte("closing_date", today)
      .neq("status", "rejected")
      .order("closing_date"),
    db.from("closings").select("closing_date, grand_total").neq("status", "rejected").lte("closing_date", today).order("closing_date", { ascending: false }).limit(1),
    db.from("ai_actions").select("id, status, severity, title, detail, ops").in("status", ["proposed", "info"]).order("created_at", { ascending: false }).limit(40),
    db.from("v_sidebar_badges").select("pending_count").limit(1),
    db.rpc("ai_read_query", {
      q: "select count(distinct li.inventory_item_id)::int as items, coalesce(sum(li.line_total),0)::float8 as spent from expense_line_items li join expenses e on e.id = li.expense_id where e.status = 'confirmed' and li.inventory_item_id is not null",
      max_rows: 1,
    }),
  ]);

  const kpi = ((kpiRes.data ?? [])[0] ?? null) as Kpis | null;
  const cash = ((cashRes.data ?? [])[0] ?? null) as CashPos | null;
  const rows = (closRes.data ?? []) as Closing[];
  const last = ((lastRes.data ?? [])[0] ?? null) as { closing_date: string; grand_total: Num } | null;
  const pending = N(((badgeRes.data ?? [])[0] as { pending_count?: number } | undefined)?.pending_count);
  const itemsRow = (Array.isArray(itemsRes.data) ? itemsRes.data[0] : null) as { items?: number; spent?: number } | null;

  // Month strip
  const byDate = new Map(rows.map((r) => [r.closing_date, r]));
  const elapsed = byDate.has(today) ? todayNum : todayNum - 1;
  const days: StripDay[] = [];
  let closedCount = 0;
  let missingCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${monthPrefix}${String(d).padStart(2, "0")}`;
    const row = byDate.get(iso);
    if (row) {
      if (d <= elapsed) closedCount++;
      days.push({ iso, d, kind: "closed", value: N(row.grand_total) });
    } else if (iso === today) days.push({ iso, d, kind: "today", value: 0 });
    else if (d > todayNum) days.push({ iso, d, kind: "future", value: 0 });
    else {
      missingCount++;
      days.push({ iso, d, kind: "missing", value: 0 });
    }
  }
  const progress = elapsed > 0 ? Math.round((closedCount / elapsed) * 100) : 0;
  const progressText =
    elapsed <= 0
      ? ar ? "أول يوم في الشهر." : "First day of the month."
      : ar
        ? `${closedCount} من ${elapsed} يوماً مُقفلة في ${monthName}. ${missingCount} ناقصة.`
        : `${closedCount} of ${elapsed} days closed in ${monthName}. ${missingCount} ${missingCount === 1 ? "is" : "are"} missing.`;

  // Payment split (month to date, else last 30 days)
  const monthRows = rows.filter((r) => r.closing_date.startsWith(monthPrefix));
  const splitRows = monthRows.length ? monthRows : rows.filter((r) => r.closing_date >= addDays(today, -30));
  const sumOf = (f: (r: Closing) => Num) => splitRows.reduce((a, r) => a + N(f(r)), 0);
  const card = sumOf((r) => r.card_total);
  const cashS = sumOf((r) => r.cash_total);
  const onlineAll = sumOf((r) => r.online_total);
  const talabat = sumOf((r) => r.talabat_total);
  const keeta = sumOf((r) => r.keeta_total);
  const beanz = sumOf((r) => r.beanz_total);
  const otherOnline = Math.max(0, onlineAll - talabat - keeta - beanz);
  const tot = card + cashS + onlineAll;
  const pct = (x: number) => (tot > 0 ? Math.round((x / tot) * 100) : 0);
  const split = [
    { k: ar ? "بطاقة" : "card", v: card, c: "#0F1C2B" },
    { k: ar ? "طلبات" : "Talabat", v: talabat, c: "#F26B1D" },
    { k: "Beanz", v: beanz, c: "#8A5A3B" },
    { k: ar ? "كيتا" : "Keeta", v: keeta, c: "#7C83A6" },
    { k: ar ? "أونلاين" : "online", v: otherOnline, c: "#2350D0" },
    { k: ar ? "نقد" : "cash", v: cashS, c: "#C98300" },
  ].filter((x) => x.v > 0.004);

  // Average day by weekday (last 120 days)
  const byDow = new Map<number, { sum: number; n: number }>();
  for (const r of rows) {
    const v = N(r.grand_total);
    if (v <= 0) continue;
    const k = new Date(`${r.closing_date}T00:00:00Z`).getUTCDay();
    const a = byDow.get(k) ?? { sum: 0, n: 0 };
    a.sum += v;
    a.n += 1;
    byDow.set(k, a);
  }
  const avgs = [...byDow.entries()].map(([k, a]) => ({ k, v: a.sum / a.n })).sort((a, b) => b.v - a.v);
  const week = avgs.length > 4 ? [...avgs.slice(0, 3), avgs[avgs.length - 1]] : avgs;
  const weekMax = Math.max(1, ...week.map((w) => w.v));

  // Autopilot findings
  const findings = ((findRes.data ?? []) as Finding[])
    .map((f) => ({ ...f, hasOps: Array.isArray(f.ops) && f.ops.length > 0 }))
    .sort((a, b) => {
      const key = (f: { status: string; severity: string; hasOps: boolean }) =>
        f.status === "proposed" && f.hasOps ? 0 : f.status === "info" ? 1 + (RANK[f.severity] ?? 2) : 5;
      return key(a) - key(b);
    });
  const tagOf = (f: { status: string; hasOps: boolean }) =>
    f.status === "info"
      ? { t: ar ? "يحتاجك" : "Needs you", c: TAG.red }
      : f.hasOps
        ? { t: ar ? "إصلاح جاهز" : "Fix ready", c: TAG.blue }
        : { t: ar ? "للتحقق" : "Check", c: TAG.grey };
  const totalFindings = findings.length + (pending > 0 ? 1 : 0);

  const lastAmount = last ? Math.round(N(last.grand_total)).toLocaleString("en-US") : "0";
  const projected = N(kpi?.projected_net);

  const FindingRows = ({ limit }: { limit: number }) => (
    <>
      {findings.slice(0, limit).map((f) => {
        const tag = tagOf(f);
        return (
          <Link
            key={f.id}
            href={`/owner/needs-you?id=${f.id}` as Route}
            className="flex items-start gap-3 border-t border-[#EDF0F3] px-[18px] py-3.5 text-strow-ink transition hover:bg-neutral-50 active:bg-neutral-100 md:px-6"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[15px] font-semibold leading-snug">{f.title}</span>
              {f.detail ? <span className="line-clamp-2 text-[13px] leading-snug text-neutral-500">{f.detail}</span> : null}
            </span>
            <span className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-semibold ${tag.c}`}>{tag.t}</span>
          </Link>
        );
      })}
      {pending > 0 ? (
        <Link href="/owner/review" className="flex items-start gap-3 border-t border-[#EDF0F3] px-[18px] py-3.5 text-strow-ink transition hover:bg-neutral-50 md:px-6">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[15px] font-semibold leading-snug">
              {ar ? `${pending} فواتير تنتظر المراجعة` : `${pending} bill${pending === 1 ? "" : "s"} waiting for review`}
            </span>
            <span className="text-[13px] leading-snug text-neutral-500">{ar ? "قراءات غير مؤكدة" : "Reads the app wasn't sure about."}</span>
          </span>
          <span className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-semibold ${TAG.grey}`}>{ar ? "مراجعة" : "Review"}</span>
        </Link>
      ) : null}
      {totalFindings === 0 ? (
        <p className="border-t border-[#EDF0F3] px-[18px] py-5 text-sm text-emerald-700 md:px-6">{ar ? "كل شيء سليم." : "All clear — nothing needs you."}</p>
      ) : null}
    </>
  );

  return (
    <div className="page">
      <header className="mb-5 hidden items-center gap-4 md:flex">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{ar ? "النبض" : "Pulse"}</h1>
          <p className="text-sm text-neutral-500">{dayLong(today, ar)}</p>
        </div>
        <form action="/owner/assistant" className="ms-auto flex h-12 w-full max-w-[440px] items-center gap-2.5 rounded-full border border-neutral-300 bg-white px-[18px] text-neutral-500">
          <Sparkle className="h-[18px] w-[18px] text-strow-blue" />
          <input
            name="q"
            placeholder={ar ? "اسأل الطيار الآلي أو ابحث عن أي فاتورة" : "Ask Autopilot or search any bill"}
            aria-label="Ask Autopilot"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-strow-ink outline-none"
          />
        </form>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_392px] md:gap-[18px]">
        {/* Hero + month strip */}
        <section className="flex flex-col gap-4 md:col-start-1 md:row-start-1 md:gap-5 md:rounded-[32px] md:bg-white md:px-[30px] md:pb-[22px] md:pt-7">
          <div className="flex flex-col gap-1.5 px-1 pt-2 md:flex-row md:items-end md:justify-between md:px-0 md:pt-0">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-neutral-500">
                {last ? `${ar ? "آخر إقفال، " : "Last close, "}${dayLong(last.closing_date, ar)}` : ar ? "لا توجد إقفالات بعد" : "No closings yet"}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-[22px] font-semibold text-neutral-500 md:text-2xl">AED</span>
                <span className="font-display text-[68px] font-bold leading-none tracking-[-2.5px] tabular-nums md:text-[84px] md:tracking-[-3px]">
                  <CountUpText text={lastAmount} duration={1100} />
                </span>
              </span>
            </div>
            <div className="mt-2.5 flex flex-col gap-2 md:mt-0 md:w-[240px] md:items-end">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-300 md:bg-[#E3E6EA]">
                <div className="pulse-fill h-1.5 rounded-full bg-strow-ink" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[13px] text-neutral-500 md:text-end">{progressText}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-[28px] bg-white px-[18px] pb-3 pt-5 md:rounded-none md:bg-transparent md:p-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-lg font-semibold">{monthName}</span>
              <span className="flex gap-3 text-xs text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-[2px] bg-strow-ink" />
                  {ar ? "مُقفل" : "Closed"}
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-[2px] border-[1.5px] border-dashed border-strow-amber" />
                  {ar ? "ناقص" : "Missing"}
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-full bg-strow-blue" />
                  {ar ? "اليوم" : "Today"}
                </span>
              </span>
            </div>
            <MonthStrip days={days} />
            {missingCount > 0 ? (
              <Link href="/close" className="flex min-h-11 items-center self-start text-sm font-semibold text-strow-amber">
                {ar ? `أكمل ${missingCount} أيام ناقصة` : `Fill the ${missingCount} missing day${missingCount === 1 ? "" : "s"}`}
              </Link>
            ) : null}
          </div>
        </section>

        {/* Autopilot */}
        <section className="flex flex-col rounded-[28px] bg-white pb-1.5 pt-[18px] md:col-start-2 md:row-span-4 md:row-start-1 md:self-start md:rounded-[32px] md:pt-6">
          <div className="flex items-center justify-between px-[18px] pb-2.5 md:px-6 md:pb-3.5">
            <Link href="/owner/needs-you" className="flex items-center gap-2.5">
              <span className="pulse-ping h-2.5 w-2.5 rounded-full bg-strow-blue" />
              <span className="font-display text-lg font-semibold md:text-xl">Autopilot</span>
            </Link>
            <Link href="/owner/needs-you" className="text-[13px] text-neutral-500">
              {ar ? `${totalFindings} ملاحظات` : `${totalFindings} finding${totalFindings === 1 ? "" : "s"}`} ›
            </Link>
          </div>
          <div className="md:hidden">
            <FindingRows limit={5} />
          </div>
          <div className="hidden md:block">
            <FindingRows limit={9} />
          </div>
          {findings.length > 5 ? (
            <Link href="/owner/needs-you" className="border-t border-[#EDF0F3] px-[18px] py-3 text-sm font-semibold text-strow-blue md:hidden">
              {ar ? "عرض الكل" : `See all ${findings.length}`}
            </Link>
          ) : null}
          <Link href="/owner/assistant/activity?tab=fixed" className="border-t border-[#EDF0F3] px-[18px] py-3 text-[13px] text-neutral-500 md:px-6">
            {ar ? "ما الذي أصلحه الطيار الآلي ›" : "What Autopilot already fixed ›"}
          </Link>
        </section>

        {/* Pay split, average day, cash */}
        <div className="grid gap-4 md:col-start-1 md:row-start-2 md:grid-cols-3 md:gap-[18px]">
          <div className="flex flex-col gap-3.5 rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
            <span className="font-display text-lg font-semibold md:text-[17px]">{ar ? "كيف يدفع العملاء" : "How customers pay"}</span>
            {tot > 0 ? (
              <>
                <div className="flex h-3.5 gap-[3px] overflow-hidden rounded-[7px] md:h-3">
                  {split.map((s) =>
                    s.v > 0 ? <div key={s.k} className="pulse-fill" style={{ width: `${Math.max(2, pct(s.v))}%`, background: s.c }} /> : null,
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
                  {split.map((s) => (
                    <span key={s.k} className="flex items-center gap-1.5">
                      <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.c }} />
                      <strong className="text-base">{pct(s.v)}%</strong> <span className="text-neutral-500">{s.k}</span>
                    </span>
                  ))}
                </div>
                <span className="text-xs text-neutral-500">{monthRows.length ? (ar ? "هذا الشهر" : "This month") : ar ? "آخر 30 يوماً" : "Last 30 days"}</span>
              </>
            ) : (
              <span className="text-sm text-neutral-500">{ar ? "لا توجد بيانات بعد" : "No sales recorded yet"}</span>
            )}
          </div>

          <div className="flex flex-col gap-2.5 rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
            <span className="font-display text-lg font-semibold md:text-[17px]">{ar ? "متوسط اليوم" : "Average day"}</span>
            {week.map((w) => {
              const low = week.length > 3 && w === week[week.length - 1];
              return (
                <div key={w.k} className="flex items-center gap-2.5 text-[13px]">
                  <span className="w-[30px] text-neutral-500">{WD_SHORT[w.k]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-[#EEF0F3]">
                    <div className="pulse-fill h-2 rounded" style={{ width: `${Math.round((w.v / weekMax) * 100)}%`, background: low ? "#C98300" : "#0F1C2B" }} />
                  </div>
                  <span className="w-12 text-end font-semibold tabular-nums">{fmt(w.v, 0)}</span>
                </div>
              );
            })}
            {!week.length ? <span className="text-sm text-neutral-500">{ar ? "لا توجد بيانات" : "Not enough closings yet"}</span> : null}
          </div>

          <div className="flex flex-col gap-2 rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
            <span className="font-display text-lg font-semibold md:text-[17px]">{ar ? "النقد في الصندوق" : "Cash on hand"}</span>
            <span className={`font-display text-[30px] font-bold tracking-[-0.6px] tabular-nums ${N(cash?.cash_on_hand) < 0 ? "text-[#9A1B12]" : ""}`}>
              {fmt(N(cash?.cash_on_hand))}
            </span>
            <span className="text-[13px] text-neutral-500">
              {N(cash?.cash_on_hand) < 0
                ? ar ? "لا يمكن أن يكون سالباً — أعد العدّ." : `Can't be negative.${cash?.anchor_date ? ` Last counted ${cash.anchor_date}.` : ""}`
                : cash?.anchor_date ? `${ar ? "آخر عدّ" : "Last counted"} ${cash.anchor_date}` : ""}
            </span>
            <a href="#cash" className="mt-1 inline-flex h-11 items-center self-start rounded-full bg-strow-ink px-[18px] text-sm font-semibold text-white">
              {ar ? "عُدّ النقد" : "Count the cash"}
            </a>
          </div>
        </div>

        {/* Small stat cards */}
        <div className="grid grid-cols-2 gap-3 md:col-start-1 md:row-start-3 md:grid-cols-4 md:gap-[18px]">
          {[
            { l: ar ? "مبيعات هذا الشهر" : "Sales this month", v: fmt(N(kpi?.revenue_mtd), 0), red: false },
            { l: ar ? "صافي متوقع" : "Projected net", v: fmt(projected, 0), red: projected < 0 },
            { l: ar ? "تكاليف ثابتة شهرياً" : "Fixed costs a month", v: fmt(N(kpi?.fixed_monthly), 0), red: false },
            { l: ar ? `إنفاق على ${N(itemsRow?.items)} صنف` : `Spent on ${N(itemsRow?.items)} items`, v: fmt(N(itemsRow?.spent)), red: false },
          ].map((s) => (
            <div key={s.l} className="flex flex-col gap-1.5 rounded-3xl bg-white p-4">
              <span className="text-[13px] text-neutral-500">{s.l}</span>
              <span className={`font-display text-2xl font-bold tracking-[-0.5px] tabular-nums ${s.red ? "text-[#9A1B12]" : ""}`}>
                <CountUpText text={s.v} from={0.4} />
              </span>
            </div>
          ))}
        </div>

        {/* Cash controls (count, withdraw, opening) */}
        {cash ? (
          <section id="cash" className="scroll-mt-6 md:col-start-1 md:row-start-4">
            <CashControls
              cashOnHand={N(cash.cash_on_hand)}
              cashInToday={N(cash.cash_in_today)}
              cashOutToday={N(cash.cash_out_today)}
              cashWithdrawnToday={N(cash.cash_withdrawn_today)}
              anchorDate={cash.anchor_date}
              needsOpeningCount={Boolean(cash.needs_opening_count)}
              locale={locale}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
