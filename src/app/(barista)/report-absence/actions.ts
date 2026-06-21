"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";

// Only non-waiter staff (barista / lead / manager) may report absences.
async function reporterRole(supabase: SupabaseClient, bid: string): Promise<string | null> {
  const { data } = await supabase.from("baristas").select("role").eq("id", bid).maybeSingle();
  const role = ((data as { role?: string } | null)?.role ?? "").toLowerCase();
  return role && role !== "waiter" ? role : null;
}

export async function markAbsent(waiterId: string, dateStr: string) {
  const session = await getBaristaSession();
  if (!session) return { error: "Not signed in" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { error: "Bad date" };

  const supabase = createServiceClient();
  if (!(await reporterRole(supabase, session.bid))) return { error: "Not allowed" };

  const { data: w } = await supabase
    .from("baristas")
    .select("id, location_id")
    .eq("id", waiterId)
    .maybeSingle();
  const waiter = w as { id: string; location_id: string } | null;
  if (!waiter) return { error: "Staff not found" };

  const { data: ex } = await supabase
    .from("attendance_days")
    .select("id")
    .eq("barista_id", waiterId)
    .eq("work_date", dateStr)
    .maybeSingle();
  const row = ex as { id: string } | null;

  if (row) {
    await supabase
      .from("attendance_days")
      .update({ status: "absent", is_override: true, overridden_by: session.bid })
      .eq("id", row.id);
  } else {
    await supabase.from("attendance_days").insert({
      location_id: waiter.location_id,
      barista_id: waiterId,
      work_date: dateStr,
      status: "absent",
      is_override: true,
      overridden_by: session.bid,
    });
  }

  await writeAudit({
    actor_id: session.bid,
    actor_type: "barista",
    action: "reported_absent",
    entity_type: "barista",
    entity_id: waiterId,
    after_state: { work_date: dateStr },
  });

  revalidatePath("/report-absence");
  revalidatePath("/owner/attendance");
  return { ok: true };
}

export async function markPresent(waiterId: string, dateStr: string) {
  const session = await getBaristaSession();
  if (!session) return { error: "Not signed in" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { error: "Bad date" };

  const supabase = createServiceClient();
  if (!(await reporterRole(supabase, session.bid))) return { error: "Not allowed" };

  await supabase
    .from("attendance_days")
    .delete()
    .eq("barista_id", waiterId)
    .eq("work_date", dateStr)
    .eq("status", "absent");

  await writeAudit({
    actor_id: session.bid,
    actor_type: "barista",
    action: "cleared_absent",
    entity_type: "barista",
    entity_id: waiterId,
    after_state: { work_date: dateStr },
  });

  revalidatePath("/report-absence");
  revalidatePath("/owner/attendance");
  return { ok: true };
}
