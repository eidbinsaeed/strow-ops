"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor } from "@/lib/auth/owner-session";

const KINDS = ["customer_held", "iou", "deferred_payment"] as const;
type Kind = (typeof KINDS)[number];

export async function createLiability(formData: FormData) {
  const counterparty = String(formData.get("counterparty") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as Kind;
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const incurred_date =
    String(formData.get("incurred_date") ?? "").trim() ||
    new Date().toISOString().slice(0, 10);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!counterparty) return { error: "Who you owe (or who owes) is required" };
  if (!KINDS.includes(kind)) return { error: "Invalid kind" };

  const amount = parseFloat(amountRaw);
  if (isNaN(amount) || amount <= 0) return { error: "Amount must be positive" };

  const supabase = createServiceClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("slug", "qave_main")
    .single();
  if (!location) return { error: "Default location not found" };

  const { data: inserted, error } = await supabase
    .from("liabilities")
    .insert({
      location_id: location.id,
      counterparty,
      kind,
      amount,
      incurred_date,
      status: "open",
      notes,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "Insert failed" };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "created",
    entity_type: "liability",
    entity_id: inserted.id,
    after_state: { counterparty, kind, amount, incurred_date },
  });

  revalidatePath("/owner/liabilities");
  return { ok: true };
}

export async function settleLiability(id: string) {
  const supabase = createServiceClient();
  const settled_date = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("liabilities")
    .update({
      status: "settled",
      settled_date,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "settled",
    entity_type: "liability",
    entity_id: id,
    after_state: { status: "settled", settled_date },
  });

  revalidatePath("/owner/liabilities");
  return { ok: true };
}

export async function reopenLiability(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("liabilities")
    .update({ status: "open", settled_date: null })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "reopened",
    entity_type: "liability",
    entity_id: id,
    after_state: { status: "open", settled_date: null },
  });

  revalidatePath("/owner/liabilities");
  return { ok: true };
}
