"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor } from "@/lib/auth/owner-session";

const STATUSES = ["present", "late", "absent", "sick", "off"];

export async function setDayStatus(baristaId: string, dateStr: string, status: string) {
  if (!baristaId) return { error: "Pick a staff member" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { error: "Bad date" };
  if (!STATUSES.includes(status)) return { error: "Bad status" };

  const supabase = createServiceClient();

  if (status === "present") {
    // present is the default — remove any exception row
    await supabase
      .from("attendance_days")
      .delete()
      .eq("barista_id", baristaId)
      .eq("work_date", dateStr);
  } else {
    const { data: ex } = await supabase
      .from("attendance_days")
      .select("id")
      .eq("barista_id", baristaId)
      .eq("work_date", dateStr)
      .maybeSingle();
    const row = ex as { id: string } | null;
    if (row) {
      await supabase
        .from("attendance_days")
        .update({ status, is_override: true })
        .eq("id", row.id);
    } else {
      const { data: b } = await supabase
        .from("baristas")
        .select("location_id")
        .eq("id", baristaId)
        .maybeSingle();
      const loc = (b as { location_id?: string } | null)?.location_id;
      if (!loc) return { error: "Staff not found" };
      await supabase.from("attendance_days").insert({
        location_id: loc,
        barista_id: baristaId,
        work_date: dateStr,
        status,
        is_override: true,
      });
    }
  }

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "attendance_set",
    entity_type: "barista",
    entity_id: baristaId,
    after_state: { work_date: dateStr, status },
  });

  revalidatePath("/owner/attendance/log");
  revalidatePath("/owner/attendance");
  revalidatePath("/owner");
  return { ok: true };
}

export async function addRecord(formData: FormData) {
  const baristaId = String(formData.get("barista_id") ?? "");
  const dateStr = String(formData.get("date") ?? "");
  const status = String(formData.get("status") ?? "");
  return setDayStatus(baristaId, dateStr, status);
}
