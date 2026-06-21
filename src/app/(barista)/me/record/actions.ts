"use server";

import { revalidatePath } from "next/cache";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";

export async function acknowledgeReport(id: string) {
  const session = await getBaristaSession();
  if (!session) return { error: "Not signed in" };

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("staff_reports")
    .select("id, barista_id, acknowledged_at")
    .eq("id", id)
    .maybeSingle();
  const row = data as
    | { id: string; barista_id: string; acknowledged_at: string | null }
    | null;

  // self-only: a staff member can only acknowledge their own report
  if (!row || row.barista_id !== session.bid) return { error: "Not allowed" };
  if (row.acknowledged_at) return { ok: true };

  const { error } = await supabase
    .from("staff_reports")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  await writeAudit({
    actor_id: session.bid,
    actor_type: "barista",
    action: "report_acknowledged",
    entity_type: "staff_report",
    entity_id: id,
  });

  revalidatePath("/me/record");
  revalidatePath("/home");
  revalidatePath("/owner/attendance/reports");
  return { ok: true };
}
