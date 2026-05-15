"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor } from "@/lib/auth/owner-session";

/**
 * Cash control actions. Both write a row to `cash_events`:
 *   - recordCashWithdrawal -> kind 'withdrawal' (cash taken out of the system)
 *   - recordCashCount      -> kind 'count'      (sets the running balance:
 *                             opening balance, a physical recount, or
 *                             "zero out" = a count of 0)
 * The running balance itself is computed by the v_cash_position view.
 */

function parseEventDate(raw: FormDataEntryValue | null): string {
  const value = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

async function defaultLocationId(): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("locations")
    .select("id")
    .eq("slug", "qave_main")
    .single();
  return data?.id ?? null;
}

export async function recordCashWithdrawal(formData: FormData) {
  const amount = parseFloat(String(formData.get("amount") ?? "").trim());
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const event_date = parseEventDate(formData.get("event_date"));

  if (isNaN(amount) || amount <= 0) {
    return { error: "Amount must be a positive number" };
  }

  const location_id = await defaultLocationId();
  if (!location_id) return { error: "Default location not found" };

  const supabase = createServiceClient();
  const { data: inserted, error } = await supabase
    .from("cash_events")
    .insert({
      location_id,
      event_date,
      kind: "withdrawal",
      amount,
      notes,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "Insert failed" };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "cash_withdrawn",
    entity_type: "cash_event",
    entity_id: inserted.id,
    after_state: { kind: "withdrawal", amount, event_date, notes },
  });

  revalidatePath("/owner");
  return { ok: true };
}

export async function recordCashCount(formData: FormData) {
  const amount = parseFloat(String(formData.get("amount") ?? "").trim());
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const event_date = parseEventDate(formData.get("event_date"));

  // A count of 0 is valid — that's the "zero out" case.
  if (isNaN(amount) || amount < 0) {
    return { error: "Amount must be zero or more" };
  }

  const location_id = await defaultLocationId();
  if (!location_id) return { error: "Default location not found" };

  const supabase = createServiceClient();
  const { data: inserted, error } = await supabase
    .from("cash_events")
    .insert({
      location_id,
      event_date,
      kind: "count",
      amount,
      notes,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "Insert failed" };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "cash_counted",
    entity_type: "cash_event",
    entity_id: inserted.id,
    after_state: { kind: "count", amount, event_date, notes },
  });

  revalidatePath("/owner");
  return { ok: true };
}
