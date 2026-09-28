import { createServiceClient } from "@/lib/supabase/server";
import { countPending } from "@/lib/ai/backfill-orders";
import { OrdersBackfill, type ScanCheck } from "./OrdersBackfill";

/** Server part: how many past photos still need their order count read, and which reads need a look. */
export async function OrdersScanCard() {
  const db = createServiceClient();
  const [recent, all, checksRes] = await Promise.all([
    countPending(40),
    countPending(null),
    db
      .from("closing_order_scans")
      .select("closing_id, reason, read, closings!inner(closing_date, transactions, photo_drive_url)")
      .eq("status", "check")
      .is("closings.transactions", null)
      .limit(60),
  ]);
  const checks: ScanCheck[] = ((checksRes.data ?? []) as unknown as {
    closing_id: string;
    reason: string | null;
    read: { transactions?: number | null } | null;
    closings: { closing_date: string; photo_drive_url: string | null } | { closing_date: string; photo_drive_url: string | null }[];
  }[])
    .map((r) => {
      const c = Array.isArray(r.closings) ? r.closings[0] : r.closings;
      return { id: r.closing_id, date: c?.closing_date ?? "", reason: r.reason, tx: r.read?.transactions ?? null, drive: c?.photo_drive_url ?? null };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return <OrdersBackfill recent={recent} all={all} checks={checks} />;
}
