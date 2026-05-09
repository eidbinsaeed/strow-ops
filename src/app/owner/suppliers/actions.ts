"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor } from "@/lib/auth/owner-session";

export async function createSupplier(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const trn = String(formData.get("trn") ?? "").trim() || null;
  const category_id = String(formData.get("category_id") ?? "").trim() || null;
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) return { error: "Name is required" };

  const supabase = createServiceClient();

  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("slug", "qave_main")
    .single();
  if (!location) return { error: "Default location not found" };

  const { data: inserted, error } = await supabase
    .from("suppliers")
    .insert({
      location_id: location.id,
      name,
      trn,
      category_id,
      contact,
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
    entity_type: "supplier",
    entity_id: inserted.id,
    after_state: { name, trn, category_id },
  });

  revalidatePath("/owner/suppliers");
  revalidatePath("/owner");
  return { ok: true };
}

export async function deleteSupplier(id: string) {
  const supabase = createServiceClient();

  const { data: before } = await supabase
    .from("suppliers")
    .select("name, trn, category_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "deleted",
    entity_type: "supplier",
    entity_id: id,
    before_state: before ?? null,
  });

  revalidatePath("/owner/suppliers");
  revalidatePath("/owner");
  return { ok: true };
}
