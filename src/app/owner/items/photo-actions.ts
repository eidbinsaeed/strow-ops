"use server";

import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor, getOwnerSession } from "@/lib/auth/owner-session";
import { clearItemPhoto, saveItemPhoto } from "@/lib/item-photo";

async function photoDone(id: string, action: string, after: Record<string, unknown>) {
  const actor = await getOwnerActor();
  await writeAudit({ actor_id: actor.id, actor_type: actor.type, action, entity_type: "inventory_item", entity_id: id, after_state: after });
  for (const p of ["/owner/items", "/owner/stock", "/owner/stock/lists"]) revalidatePath(p);
}

/** A photo the web finder found (already shrunk in the browser). Never replaces one that's there. */
export async function saveItemPhotoFromWeb(id: string, dataUrl: string, page: string | null) {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  const r = await saveItemPhoto(id, dataUrl, "web", { onlyIfEmpty: true, page });
  if (r.error) return { error: r.error };
  if (r.saved) await photoDone(id, "photo_from_web", { photo_source: "web", photo_page: page });
  return { ok: true, saved: r.saved };
}

/** The owner picked a photo by hand (already shrunk in the browser). Replaces any photo. */
export async function uploadItemPhoto(id: string, dataUrl: string) {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  const r = await saveItemPhoto(id, dataUrl, "upload");
  if (!r.saved) return { error: r.error ?? "Couldn't save the photo" };
  await photoDone(id, "photo_uploaded", { photo_source: "upload" });
  return { ok: true };
}

export async function removeItemPhoto(id: string) {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  const r = await clearItemPhoto(id);
  if (!r.ok) return { error: r.error ?? "Couldn't remove the photo" };
  await photoDone(id, "photo_removed", { photo_source: null });
  return { ok: true };
}
