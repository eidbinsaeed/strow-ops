import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { todayDubai } from "@/lib/dates";
import { PosUpload } from "./PosUpload";

export const dynamic = "force-dynamic";

type ReportRow = {
  id: string;
  business_date: string;
  generated_at: string;
  source: string;
  orders_paid: number | string;
  total_paid: number | string;
  closing_check: { state?: string; diff?: number | string } | null;
};

const LIST_LIMIT = 120;
const CHIP = "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold";
const TONE = {
  blue: "bg-[#E3EAFB] text-[#1A3FA8]",
  green: "bg-[#E7F6EC] text-[#0A6B34]",
  red: "bg-[#FBE9E7] text-[#9A1B12]",
  amber: "bg-[#FFF4E0] text-[#6E4200]",
  grey: "bg-[#EEF0F3] text-[#3F4A57]",
} as const;

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function aed(n: number): string {
  return `AED ${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "Tue 6 Oct" / "الثلاثاء 6 أكتوبر" for a YYYY-MM-DD date (built from parts so it matches the upload list). */
function dayLabel(iso: string, ar: boolean): string {
  const [y, m, d] = iso.split("-").map(Number);
  const parts = new Intl.DateTimeFormat(ar ? "ar-AE-u-nu-latn" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(
    new Date(Date.UTC(y, m - 1, d)),
  );
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** When the POS made the report, in Dubai time; the date is added when it is not the business day. */
function reportTime(generatedAt: string, businessDate: string, ar: boolean): string {
  const d = new Date(generatedAt);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Dubai" });
  if (d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }) === businessDate) return time;
  const day = d.toLocaleDateString(ar ? "ar-AE-u-nu-latn" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });
  return `${day} ${time}`;
}

export default async function PosReportsPage() {
  const locale = await getLocale();
  const ar = locale === "ar";
  const db = createServiceClient();
  const today = todayDubai();
  const [ty, tm] = today.split("-").map(Number);
  // The current month and the two before it.
  const months = [2, 1, 0].map((back) => {
    const d = new Date(Date.UTC(ty, tm - 1 - back, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
  });
  const from = isoDay(months[0].y, months[0].m, 1);

  const [listRes, coverRes, closingRes] = await Promise.all([
    db
      .from("pos_daily_reports")
      .select("id, business_date, generated_at, source, orders_paid, total_paid, closing_check")
      .order("business_date", { ascending: false })
      .limit(LIST_LIMIT),
    db.from("pos_daily_reports").select("business_date").gte("business_date", from).lte("business_date", today),
    db.from("closings").select("closing_date").neq("status", "rejected").gte("closing_date", from).lte("closing_date", today),
  ]);

  const header = (
    <header className="px-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{ar ? "المبيعات" : "Sales"}</p>
      <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{ar ? "تقارير نقاط البيع" : "POS reports"}</h1>
      <p className="text-sm text-neutral-500">
        {ar
          ? "تصل تلقائياً كل صباح الساعة 7:55 من بريد نظام نقاط البيع. ارفع تقارير الأيام السابقة هنا، ويُقرأ التاريخ من كل ملف."
          : "They arrive automatically every morning at 7:55 from the POS email. Upload old days here; the date is read from each file."}
      </p>
    </header>
  );

  if (listRes.error) {
    return (
      <div className="page flex flex-col gap-4 md:gap-5">
        {header}
        <p className="rounded-[28px] bg-[#FBE9E7] px-[18px] py-5 text-sm text-[#9A1B12] md:p-[22px]">
          {ar ? "جداول تقارير نقاط البيع غير موجودة في قاعدة البيانات بعد" : "POS reports are not set up in the database yet"} — 0019_pos_reports.sql. ({listRes.error.message})
        </p>
      </div>
    );
  }

  const reports = (listRes.data ?? []) as ReportRow[];
  const withReport = new Set(((coverRes.data ?? []) as { business_date: string }[]).map((r) => r.business_date));
  const withClosing = new Set(((closingRes.data ?? []) as { closing_date: string }[]).map((r) => r.closing_date));

  return (
    <div className="page flex flex-col gap-4 md:gap-5">
      {header}

      <PosUpload />

      <section className="rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{ar ? "الأيام المغطاة" : "Coverage"}</h2>
          <p className="text-xs text-neutral-500">{ar ? "آخر 3 أشهر" : "Last 3 months"}</p>
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-3 md:gap-5">
          {months.map(({ y, m }) => (
            <MonthGrid key={`${y}-${m}`} y={y} m={m} today={today} ar={ar} withReport={withReport} withClosing={withClosing} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-500">
          <Legend swatch="bg-strow-blue" label={ar ? "تقرير نقاط البيع" : "POS report"} />
          <Legend swatch="bg-[#C9D0D9]" label={ar ? "إغلاق الباريستا فقط" : "Barista closing only"} />
          <Legend swatch="ring-1 ring-inset ring-[#D4D9E0]" label={ar ? "لا شيء" : "Nothing"} />
        </div>
      </section>

      <section className="rounded-[28px] bg-white pb-1.5 pt-[18px] md:pt-6">
        <div className="flex items-baseline justify-between gap-3 px-[18px] pb-2 md:px-6">
          <h2 className="font-display text-lg font-semibold">{ar ? "التقارير المستوردة" : "Imported reports"}</h2>
          {reports.length ? (
            <span className="text-xs text-neutral-500 tabular-nums">
              {reports.length === LIST_LIMIT ? (ar ? `آخر ${LIST_LIMIT}` : `Latest ${LIST_LIMIT}`) : reports.length}
            </span>
          ) : null}
        </div>
        {reports.length === 0 ? (
          <p className="border-t border-[#EDF0F3] px-[18px] py-6 text-sm text-neutral-500 md:px-6">
            {ar
              ? "لا توجد تقارير بعد. ستظهر هنا بعد بريد الصباح، أو ارفع الأيام السابقة من الأعلى."
              : "No reports yet. They show up here after the morning email, or upload old days above."}
          </p>
        ) : (
          <ul>
            {reports.map((r) => (
              <ReportItem key={r.id} r={r} ar={ar} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MonthGrid({
  y,
  m,
  today,
  ar,
  withReport,
  withClosing,
}: {
  y: number;
  m: number;
  today: string;
  ar: boolean;
  withReport: Set<string>;
  withClosing: Set<string>;
}) {
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // weeks start on Monday
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(ar ? "ar-AE-u-nu-latn" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const dates = Array.from({ length: days }, (_, i) => isoDay(y, m, i + 1));
  const past = dates.filter((d) => d <= today);
  const covered = past.filter((d) => withReport.has(d)).length;
  const weekdays = ar ? ["ن", "ث", "ر", "خ", "ج", "س", "ح"] : ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-neutral-500 tabular-nums">
          {covered}/{past.length} {ar ? "يوم" : "days"}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((w, i) => (
          <span key={i} className="pb-0.5 text-center text-[10px] font-semibold text-neutral-400">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {dates.map((d, i) => {
          const future = d > today;
          const state = future ? "future" : withReport.has(d) ? "report" : withClosing.has(d) ? "closing" : "none";
          const tone =
            state === "report"
              ? "bg-strow-blue text-white"
              : state === "closing"
                ? "bg-[#C9D0D9] text-[#1F2A36]"
                : state === "none"
                  ? "ring-1 ring-inset ring-[#D4D9E0] text-neutral-500"
                  : "text-neutral-300";
          const what =
            state === "report"
              ? ar ? "تقرير نقاط البيع" : "POS report"
              : state === "closing"
                ? ar ? "إغلاق الباريستا فقط" : "barista closing only"
                : state === "none"
                  ? ar ? "لا شيء" : "nothing"
                  : "";
          return (
            <span
              key={d}
              title={what ? `${dayLabel(d, ar)} — ${what}` : undefined}
              className={`flex h-7 items-center justify-center rounded-[7px] text-[11px] font-medium tabular-nums ${tone} ${d === today ? "outline outline-2 outline-offset-1 outline-[#0F1C2B]/25" : ""}`}
            >
              {i + 1}
              {what ? <span className="sr-only">{` — ${what}`}</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-[4px] ${swatch}`} aria-hidden />
      {label}
    </span>
  );
}

function ReportItem({ r, ar }: { r: ReportRow; ar: boolean }) {
  const orders = Number(r.orders_paid);
  const total = Number(r.total_paid);
  const source = r.source === "upload" ? (ar ? "رفع" : "Upload") : r.source === "manual" ? (ar ? "يدوي" : "Manual") : ar ? "بريد" : "Email";
  const time = reportTime(r.generated_at, r.business_date, ar);
  return (
    <li className="flex items-center gap-3 border-t border-[#EDF0F3] px-[18px] py-3 md:px-6">
      <div className="min-w-0 flex-1">
        <p className="text-[15px]">
          <span className="font-semibold">{dayLabel(r.business_date, ar)}</span>
          <span className="whitespace-nowrap text-[13px] text-neutral-500 tabular-nums">
            {" · "}
            {orders} {ar ? "طلب" : orders === 1 ? "order" : "orders"}
          </span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-neutral-500">
          <span className={`${CHIP} ${r.source === "email" ? TONE.blue : TONE.grey}`}>{source}</span>
          {time ? <span className="whitespace-nowrap tabular-nums">{ar ? `التقرير ${time}` : `Report ${time}`}</span> : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[15px] font-semibold tabular-nums">{Number.isFinite(total) ? aed(total) : "—"}</span>
        <ClosingChip check={r.closing_check} ar={ar} />
      </div>
    </li>
  );
}

function ClosingChip({ check, ar }: { check: ReportRow["closing_check"]; ar: boolean }) {
  switch (check?.state) {
    case "match":
      return <span className={`${CHIP} ${TONE.green}`}>{ar ? "يطابق الإغلاق" : "Matches closing"}</span>;
    case "mismatch": {
      const diff = Number(check.diff);
      const gap = Number.isFinite(diff) ? aed(Math.abs(diff)) : "AED ?";
      const why = !Number.isFinite(diff)
        ? undefined
        : diff > 0
          ? ar ? "نقاط البيع أعلى من الإغلاق" : "POS is higher than the closing"
          : ar ? "الإغلاق أعلى من نقاط البيع" : "The closing is higher than the POS";
      return (
        <span className={`${CHIP} tabular-nums ${TONE.red}`} title={why}>
          {ar ? `فرق ${gap}` : `Gap ${gap}`}
        </span>
      );
    }
    case "no_closing":
      return <span className={`${CHIP} ${TONE.grey}`}>{ar ? "لا يوجد إغلاق" : "No closing"}</span>;
    case "report_before_closing":
      return <span className={`${CHIP} ${TONE.amber}`}>{ar ? "قبل الإغلاق" : "Before closing"}</span>;
    default:
      return null;
  }
}
