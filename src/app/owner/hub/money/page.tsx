import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { loadMonth } from "@/lib/owner-month";
import { MoneyView } from "@/components/apple/MoneyView";

export const dynamic = "force-dynamic";

export default async function MoneyPage() {
  const locale = await getLocale();
  const db = createServiceClient();
  const m = await loadMonth(locale === "ar");
  const monthStart = `${m.today.slice(0, 8)}01`;
  const [pos, vendors, recurring, owed, waitC, waitB] = await Promise.all([
    db.from("pos_daily_reports").select("id", { count: "exact", head: true }).gte("business_date", monthStart),
    db.from("suppliers").select("id", { count: "exact", head: true }),
    db.from("fixed_costs").select("id", { count: "exact", head: true }).eq("is_active", true),
    db.from("liabilities").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("closings").select("id", { count: "exact", head: true }).in("status", ["pending_review", "flagged"]),
    db.from("expenses").select("id", { count: "exact", head: true }).in("status", ["pending_review", "flagged"]),
  ]);
  return (
    <MoneyView
      m={m}
      locale={locale}
      c={{
        posReports: pos.count ?? 0,
        vendors: vendors.count ?? 0,
        recurring: recurring.count ?? 0,
        owed: owed.count ?? 0,
        approvals: (waitC.count ?? 0) + (waitB.count ?? 0),
      }}
    />
  );
}
