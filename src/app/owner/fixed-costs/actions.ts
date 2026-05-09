"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor } from "@/lib/auth/owner-session";

const KINDS = ["salary", "rent", "utility", "subscription", "other"] as const;
const FREQUENCIES = ["monthly", "quarterly", "annual", "one_time"] as const;

type Kind = (typeof KINDS)[number];
type Frequency = (typeof FREQUENCIES)[number];

export async function createFixedCost(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as Kind;
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "") as Frequency;
  const dueDayRaw = String(formData.get("due_day") ?? "").trim();
  const linked_barista_id =
    String(formData.get("linked_barista_id") ?? "").trim() || null;

  if (!name) return { error: "Name is required" };
  if (!KINDS.includes(kind)) return { error: "Invalid kind" };
  if (!FREQUENCIES.includes(frequency)) return { error: "Invalid frequency" };

  const amount = parseFloat(amountRaw);
  if (isNaN(amount) || amount < 0) return { error: "Invalid amount" };

  const due_day = parseInt(dueDayRaw, 10);
  if (isNaN(due_day) || due_day < 1 || due_day > 31)
    return { error: "Due day must be 1-31" };

  const supabase = createServiceClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("slug", "qave_main")
    .single();
  if (!location) return { error: "Default location not found" };

  const { data: inserted, error } = await supabase
    .from("fixed_costs")
    .insert({
      location_id: location.id,
      name,
      kind,
      amount,
      frequency,
      due_day,
      linked_barista_id: kind === "salary" ? linked_barista_id : null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "Insert failed" };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "created",
    entity_type: "fixed_cost",
    entity_id: inserted.id,
    after_state: { name, kind, amount, frequency, due_day },
  });

  revalidatePath("/owner/fixed-costs");
  return { ok: true };
}

export async function deactivateFixedCost(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("fixed_costs")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "deactivated",
    entity_type: "fixed_cost",
    entity_id: id,
  });

  revalidatePath("/owner/fixed-costs");
  return { ok: true };
}

export async function reactivateFixedCost(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("fixed_costs")
    .update({ is_active: true })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "reactivated",
    entity_type: "fixed_cost",
    entity_id: id,
  });

  revalidatePath("/owner/fixed-costs");
  return { ok: true };
}
