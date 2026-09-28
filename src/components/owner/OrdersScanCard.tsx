import { createServiceClient } from "@/lib/supabase/server";
import { countPending } from "@/lib/ai/backfill-orders";
import { OrdersBackfill, type ScanCheck } from "./OrdersBackfill";

/** Server part: how many past photos still need their order count read, and which reads need a look. */
type C = { closing_date: string; photo_drive_url: string | null; transactions: number | null; online_total: number | string | null; talabat_total: number | string | null; keeta_total: number | string | null; beanz_total: number | string | null };

export async function OrdersScanCard() {
  const db = createServiceClient();
  const [recent, all, checksRes] = await Promise.all([
    countPending(40),
    countPending(null),
    db
      .from("closing_order_scans")
      .select("closing_id, reason, read, closings!inner(closing_date, transactions, photo_drive_url, online_total, talabat_total, keeta_total, beanz_total)")
      .eq("status", "check")
      .limit(120),
  ]);
  const checks: ScanCheck[] = ((checksRes.data ?? []) as unknown as {
    closing_id: string;
    reason: string | null;
    read: { transactions?: number | null } | null;
    closings: C | C[];
  }[])
    .map((r) => {
      const c = Array.isArray(r.closings) ? r.closings[0] : r.closings;
      const needCount = c?.transactions == null;
      const needSplit = c != null && c.talabat_total == null && c.keeta_total == null && c.beanz_total == null && Number(c.online_total ?? 0) > 0;
      return { id: r.closing_id, date: c?.closing_date ?? "", reason: r.reason, tx: needCount ? (r.read?.transactions ?? null) : null, drive: c?.photo_drive_url ?? null, open: needCount || needSplit };
    })
    .filter((x) => x.open)
    .map(({ open: _open, ...x }) => x)
    .sort((a, b) => b.date.localeCompare(a.date));
  return <OrdersBackfill recent={recent} all={all} checks={checks} />;
}
