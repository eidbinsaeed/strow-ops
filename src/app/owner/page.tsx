import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { todayDubai } from "@/lib/dates";
import { addDays, dayLong, N, WD, WD_AR } from "@/lib/owner-month";
import { buildPeriods, PERIOD_KEYS, type HomeBill, type HomeClosing, type PeriodKey } from "@/lib/home-periods";
import { HomeView, type HomeData, type HomeFinding } from "@/components/apple/HomeView";

export const dynamic = "force-dynamic";

type Num = number | string | null;
type Closing = HomeClosing & { baristas: { name: string } | { name: string }[] | null };
type Finding = { id: string; status: string; severity: string; title: string; detail: string | null; ops: unknown[] | null };

const RANK: Record<string, number> = { critical: 0, warn: 1, info: 2 };

function firstSentence(t: string | null): string | null {
  if (!t) return null;
  const s = t.split(/(?<=[.!?])\s/)[0].trim();
  return s.length > 90 ? `${s.slice(0, 89)}…` : s;
}

/**
 * Home (the owner's main dashboard): sales by week, month or year up to the last
 * close, what needs you, the last close and cash. Closings arrive at the end of
 * the day, so nothing here is framed around "today".
 */
export default async function HomePage() {
  const locale = await getLocale();
  const ar = locale === "ar";
  const db = createServiceClient();
  const today = todayDubai();
  const monthPrefix = today.slice(0, 8);
  const yearStart = `${Number(today.slice(0, 4)) - 1}-12-01`; // a little before Jan 1, so January can compare with December
  const saved = (await cookies()).get("home_period")?.value as PeriodKey | undefined;

  const [closRes, findRes, waitC, waitB, posRes, billRes, cashRes] = await Promise.all([
    db
      .from("closings")
      .select("closing_date, grand_total, cash_total, online_total, talabat_total, keeta_total, beanz_total, transactions, baristas(name)")
      .neq("status", "rejected")
      .lte("closing_date", today)
      .gte("closing_date", yearStart)
      .order("closing_date", { ascending: false })
      .range(0, 999),
    db.from("ai_actions").select("id, status, severity, title, detail, ops").in("status", ["proposed", "info"]).order("created_at", { ascending: false }).limit(60),
    db.from("closings").select("id", { count: "exact", head: true }).in("status", ["pending_review", "flagged"]),
    db.from("expenses").select("id", { count: "exact", head: true }).in("status", ["pending_review", "flagged"]),
    db.from("pos_daily_reports").select("business_date, generated_at, total_paid, orders_paid").order("business_date", { ascending: false }).limit(1),
    db.from("expenses").select("expense_date, total").neq("status", "rejected").gte("expense_date", yearStart).lte("expense_date", today).range(0, 4999),
    db.from("v_cash_position").select("cash_on_hand").limit(1),
  ]);

  const rows = (closRes.data ?? []) as Closing[];
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.closing_date, (byDate.get(r.closing_date) ?? 0) + N(r.grand_total));
  const last = rows[0] ?? null;

  // Days this month with no close (up to yesterday, or today once it is closed).
  const todayNum = Number(today.slice(8, 10));
  const elapsed = byDate.has(today) ? todayNum : todayNum - 1;
  let missingDays = 0;
  for (let d = 1; d <= elapsed; d++) if (!byDate.has(`${monthPrefix}${String(d).padStart(2, "0")}`)) missingDays++;

  let lastClose: HomeData["last"] = null;
  if (last) {
    const lastDate = last.closing_date;
    const dow = new Date(`${lastDate}T00:00:00Z`).getUTCDay();
    const amount = byDate.get(lastDate) ?? N(last.grand_total);
    const prev = byDate.get(addDays(lastDate, -7));
    let compare: { pct: number; label: string } | null = null;
    if (prev && prev > 0) {
      const pct = Math.round(((amount - prev) / prev) * 100);
      const abs = Math.abs(pct);
      compare = {
        pct,
        label: ar
          ? pct === 0 ? `مثل ${WD_AR[dow]} الماضي` : `${pct > 0 ? "أكثر" : "أقل"} بـ${abs}٪ من ${WD_AR[dow]} الماضي`
          : pct === 0 ? `Same as last ${WD[dow]}` : `${abs}% ${pct > 0 ? "more" : "less"} than last ${WD[dow]}`,
      };
    }
    const b = Array.isArray(last.baristas) ? last.baristas[0] : last.baristas;
    const orders = rows.filter((r) => r.closing_date === lastDate).reduce((a, r) => a + (r.transactions ?? 0), 0) || null;
    lastClose = {
      date: dayLong(lastDate, ar),
      who: b?.name ?? null,
      amount,
      orders,
      avgOrder: orders ? amount / orders : null,
      compare,
      href: `/owner/closings?from=${lastDate}&to=${lastDate}`,
    };
  }

  // POS: "today so far" until the closing comes in, else a check against the last close.
  const pos = ((posRes.data ?? [])[0] ?? null) as { business_date: string; total_paid: Num; orders_paid: number } | null;
  let posLine: HomeData["pos"] = null;
  if (pos) {
    const href = `/owner/sales?p=day&d=${pos.business_date}`;
    if (!last || pos.business_date > last.closing_date) {
      posLine = {
        kind: "ahead",
        label: `${dayLong(pos.business_date, ar)} · ${ar ? "الإقفال لم يصل" : "close not in yet"}`,
        amount: N(pos.total_paid),
        orders: pos.orders_paid,
        href,
      };
    } else if (pos.business_date === last.closing_date) {
      const diff = N(pos.total_paid) - (byDate.get(last.closing_date) ?? 0);
      posLine =
        Math.abs(diff) <= 1
          ? { kind: "match", label: ar ? "مطابق لتقرير نقاط البيع" : "Matches the POS report", href }
          : {
              kind: "gap",
              label: ar
                ? `نقاط البيع ${Math.round(N(pos.total_paid)).toLocaleString("en-US")} · فرق ${Math.abs(diff).toFixed(2)}`
                : `POS took AED ${Math.round(N(pos.total_paid)).toLocaleString("en-US")} · gap AED ${Math.abs(diff).toFixed(2)}`,
              href,
            };
    }
  }

  const all = ((findRes.data ?? []) as Finding[])
    .map((f) => ({ ...f, hasOps: Array.isArray(f.ops) && f.ops.length > 0 }))
    .sort((a, b) => {
      const key = (f: { status: string; severity: string; hasOps: boolean }) => (f.status === "proposed" && f.hasOps ? 0 : f.status === "info" ? 1 + (RANK[f.severity] ?? 2) : 5);
      return key(a) - key(b);
    });
  const findings: HomeFinding[] = all.slice(0, 4).map((f) => ({
    id: f.id,
    title: f.title,
    sub: firstSentence(f.detail),
    kind: f.status === "info" ? "needs" : f.hasOps ? "fix" : "check",
  }));

  const periods = buildPeriods(rows, (billRes.data ?? []) as HomeBill[], last?.closing_date ?? null, today, ar);
  const cashRow = ((cashRes.data ?? [])[0] ?? null) as { cash_on_hand: Num } | null;

  const data: HomeData = {
    subtitle: last ? (ar ? `الأرقام حتى ${dayLong(last.closing_date, ar)}` : `Figures up to ${dayLong(last.closing_date, ar)}`) : dayLong(today, ar),
    periods,
    initial: saved && PERIOD_KEYS.includes(saved) ? saved : "month",
    last: lastClose,
    pos: posLine,
    findings,
    openCount: all.length,
    approvals: (waitC.count ?? 0) + (waitB.count ?? 0),
    missingDays,
    cash: cashRow ? N(cashRow.cash_on_hand) : null,
  };
  return <HomeView d={data} locale={locale} />;
}
