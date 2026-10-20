"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor, getOwnerSession } from "@/lib/auth/owner-session";
import { clearSupplierLogo, saveSupplierLogo } from "@/lib/supplier-logo";

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

// ── Logos ────────────────────────────────────────────────────────────────

async function logoDone(id: string, action: string, after: Record<string, unknown>) {
  const actor = await getOwnerActor();
  await writeAudit({ actor_id: actor.id, actor_type: actor.type, action, entity_type: "supplier", entity_id: id, after_state: after });
  revalidatePath("/owner/suppliers");
  revalidatePath("/owner/expenses");
}

/** The owner picked a logo by hand (already shrunk in the browser). Replaces any logo. */
export async function uploadSupplierLogo(id: string, dataUrl: string) {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  const r = await saveSupplierLogo(id, dataUrl, "upload");
  if (!r.saved) return { error: r.error ?? "Couldn't save the logo" };
  await logoDone(id, "logo_uploaded", { logo_source: "upload" });
  return { ok: true };
}

/** A logo the past-bills finder cut out. Never replaces a logo that's already there. */
export async function saveLogoFromBill(id: string, dataUrl: string) {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  const r = await saveSupplierLogo(id, dataUrl, "bill", { onlyIfEmpty: true });
  if (r.error) return { error: r.error };
  if (r.saved) await logoDone(id, "logo_from_bill", { logo_source: "bill" });
  return { ok: true, saved: r.saved };
}

export async function removeSupplierLogo(id: string) {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  const r = await clearSupplierLogo(id);
  if (!r.ok) return { error: r.error ?? "Couldn't remove the logo" };
  await logoDone(id, "logo_removed", { logo_source: null });
  return { ok: true };
}
