"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor } from "@/lib/auth/owner-session";

const KINDS = ["warning", "incident", "note", "commendation"];
const SEVS = ["low", "medium", "high"];

export async function addStaffReport(formData: FormData) {
  const barista_id = String(formData.get("barista_id") ?? "");
  const kind = String(formData.get("kind") ?? "note");
  const title = String(formData.get("title") ?? "").trim();
  const detail = String(formData.get("detail") ?? "").trim() || null;
  const severityRaw = String(formData.get("severity") ?? "").trim();
  const severity = SEVS.includes(severityRaw) ? severityRaw : null;
  const occurredRaw = String(formData.get("occurred_on") ?? "").trim();
  const occurred_on = /^\d{4}-\d{2}-\d{2}$/.test(occurredRaw) ? occurredRaw : undefined;

  if (!barista_id) return { error: "Pick a staff member" };
  if (!KINDS.includes(kind)) return { error: "Bad type" };
  if (!title) return { error: "Title is required" };

  const supabase = createServiceClient();
  const { data: b } = await supabase
    .from("baristas")
    .select("location_id")
    .eq("id", barista_id)
    .maybeSingle();
  const loc = (b as { location_id?: string } | null)?.location_id;
  if (!loc) return { error: "Staff not found" };

  const { error } = await supabase.from("staff_reports").insert({
    location_id: loc,
    barista_id,
    kind,
    title,
    detail,
    severity,
    occurred_on,
  });
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "report_added",
    entity_type: "barista",
    entity_id: barista_id,
    after_state: { kind, title },
  });
  revalidatePath("/owner/attendance/reports");
  return { ok: true };
}

export async function deleteStaffReport(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("staff_reports").delete().eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "report_deleted",
    entity_type: "staff_report",
    entity_id: id,
  });
  revalidatePath("/owner/attendance/reports");
  return { ok: true };
}
