import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { todayDubai } from "@/lib/dates";
import { addDays, dayLong, N, WD, WD_AR } from "@/lib/owner-month";
import { TodayView, type TodayData, type TodayFinding } from "@/components/apple/TodayView";

export const dynamic = "force-dynamic";

type Num = number | string | null;
type Closing = {
  closing_date: string;
  grand_total: Num;
  cash_total: Num;
  online_total: Num;
  talabat_total: Num;
  keeta_total: Num;
  beanz_total: Num;
  transactions: number | null;
  baristas: { name: string } | { name: string }[] | null;
};
type Finding = { id: string; status: string; severity: string; title: string; detail: string | null; ops: unknown[] | null };

const RANK: Record<string, number> = { critical: 0, warn: 1, info: 2 };
const LETTER_EN = ["S", "M", "T", "W", "T", "F", "S"];
const LETTER_AR = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];

function firstSentence(t: string | null): string | null {
  if (!t) return null;
  const s = t.split(/(?<=[.!?])\s/)[0].trim();
  return s.length > 90 ? `${s.slice(0, 89)}…` : s;
}

/** Today (the owner home): last close, what needs you, the day at a glance. The month lives in Money. */
export default async function TodayPage() {
  const locale = await getLocale();
  const ar = locale === "ar";
  const db = createServiceClient();
  const today = todayDubai();
  const monthPrefix = today.slice(0, 8);

  const [closRes, findRes, waitC, waitB, posRes] = await Promise.all([
    db
      .from("closings")
      .select("closing_date, grand_total, cash_total, online_total, talabat_total, keeta_total, beanz_total, transactions, baristas(name)")
      .neq("status", "rejected")
      .lte("closing_date", today)
      .gte("closing_date", addDays(today, -70))
      .order("closing_date", { ascending: false })
      .limit(80),
    db.from("ai_actions").select("id, status, severity, title, detail, ops").in("status", ["proposed", "info"]).order("created_at", { ascending: false }).limit(60),
    db.from("closings").select("id", { count: "exact", head: true }).in("status", ["pending_review", "flagged"]),
    db.from("expenses").select("id", { count: "exact", head: true }).in("status", ["pending_review", "flagged"]),
    db.from("pos_daily_reports").select("business_date, generated_at, total_paid, orders_paid").order("business_date", { ascending: false }).limit(1),
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

  let close: TodayData["close"] = null;
  let glance: TodayData["glance"] = null;
  if (last) {
    const lastDate = last.closing_date;
    const dow = new Date(`${lastDate}T00:00:00Z`).getUTCDay();
    const ago = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000);
    const amount = byDate.get(lastDate) ?? N(last.grand_total);
    const bars = Array.from({ length: 7 }, (_, k) => {
      const iso = addDays(lastDate, k - 6);
      const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
      return { iso, letter: (ar ? LETTER_AR : LETTER_EN)[wd], value: byDate.has(iso) ? (byDate.get(iso) as number) : null, isLast: k === 6 };
    });
    const vals = bars.map((b) => b.value).filter((v): v is number => v != null);
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
    close = {
      title: ago > 6 ? `${ar ? "آخر إقفال" : "Last close"} · ${dayLong(lastDate, ar)}` : ar ? `إقفال ${WD_AR[dow]}` : `${WD[dow]}'s close`,
      who: b?.name ?? null,
      amount,
      compare,
      bars,
      avg: vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : 0,
      total: vals.reduce((a, v) => a + v, 0),
    };

    const split = last.talabat_total != null || last.keeta_total != null || last.beanz_total != null;
    const apps = split ? N(last.talabat_total) + N(last.keeta_total) + N(last.beanz_total) : N(last.online_total);
    const lead = split
      ? [
          { k: ar ? "طلبات" : "Talabat", v: N(last.talabat_total) },
          { k: ar ? "كيتا" : "Keeta", v: N(last.keeta_total) },
          { k: "Beanz", v: N(last.beanz_total) },
        ].sort((x, y) => y.v - x.v)[0]
      : null;
    const total = N(last.grand_total);
    glance = {
      title: ar ? `${WD_AR[dow]} باختصار` : `${WD[dow]} at a glance`,
      orders: last.transactions ?? null,
      avgOrder: last.transactions ? total / last.transactions : null,
      total,
      appsPct: total > 0 ? Math.round((apps / total) * 100) : null,
      appsAmount: apps,
      appsLead: lead && lead.v > 0 ? lead.k : null,
      cash: N(last.cash_total),
      cashPct: total > 0 ? Math.round((N(last.cash_total) / total) * 100) : 0,
    };
  }

  // POS: "today so far" until the closing comes in, else a check against the last close.
  const pos = ((posRes.data ?? [])[0] ?? null) as { business_date: string; total_paid: Num; orders_paid: number } | null;
  let posLine: TodayData["pos"] = null;
  if (pos) {
    const href = `/owner/sales?p=day&d=${pos.business_date}`;
    if (!last || pos.business_date > last.closing_date) {
      posLine = {
        kind: "ahead",
        label: pos.business_date === today ? (ar ? "اليوم حتى الآن" : "Today so far") : `${dayLong(pos.business_date, ar)} · ${ar ? "الإقفال لم يصل" : "close not in yet"}`,
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
  const findings: TodayFinding[] = all.slice(0, 4).map((f) => ({
    id: f.id,
    title: f.title,
    sub: firstSentence(f.detail),
    kind: f.status === "info" ? "needs" : f.hasOps ? "fix" : "check",
  }));

  const data: TodayData = {
    dateLabel: dayLong(today, ar),
    close,
    pos: posLine,
    findings,
    openCount: all.length,
    approvals: (waitC.count ?? 0) + (waitB.count ?? 0),
    missingDays,
    glance,
  };
  return <TodayView d={data} locale={locale} />;
}
