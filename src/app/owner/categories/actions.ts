"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor } from "@/lib/auth/owner-session";

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const parent_id = String(formData.get("parent_id") ?? "").trim() || null;

  if (!name) return { error: "Name is required" };

  const supabase = createServiceClient();
  const { data: inserted, error } = await supabase
    .from("categories")
    .insert({ name, parent_id, is_active: true })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "Insert failed" };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "created",
    entity_type: "category",
    entity_id: inserted.id,
    after_state: { name, parent_id },
  });

  revalidatePath("/owner/categories");
  revalidatePath("/owner");
  return { ok: true };
}

export async function deactivateCategory(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "deactivated",
    entity_type: "category",
    entity_id: id,
  });

  revalidatePath("/owner/categories");
  revalidatePath("/owner");
  return { ok: true };
}

export async function reactivateCategory(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: true })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "reactivated",
    entity_type: "category",
    entity_id: id,
  });

  revalidatePath("/owner/categories");
  revalidatePath("/owner");
  return { ok: true };
}
