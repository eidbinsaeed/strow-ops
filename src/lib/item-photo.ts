/**
 * Item photos — one small image per stock item in the private `item-photos`
 * bucket, served by /api/item-photo/[id]. Same rules as the vendor logos:
 *  - "web": found on the web (the product page, or Wikipedia for produce). Only fills an empty slot.
 *  - "upload": picked by hand on the Items page. Always wins.
 * The browser shrinks every image to ≤ 360 px JPEG before it is sent.
 */
import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "item-photos";
const MAX_BYTES = 400_000;

export type PhotoSource = "web" | "bill" | "upload";

function parseDataUrl(dataUrl: string): { contentType: string; ext: string; bytes: Buffer } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  const bytes = Buffer.from(m[2], "base64");
  if (!bytes.length || bytes.length > MAX_BYTES) return null;
  return { contentType: m[1], ext: m[1] === "image/jpeg" ? "jpg" : m[1].slice(6), bytes };
}

async function ensureBucket() {
  const { error } = await createServiceClient().storage.createBucket(BUCKET, { public: false });
  if (error && !/exist/i.test(error.message)) throw error;
}

export async function saveItemPhoto(
  itemId: string,
  dataUrl: string,
  source: PhotoSource,
  opts: { onlyIfEmpty?: boolean; page?: string | null } = {},
): Promise<{ saved: boolean; error?: string }> {
  const img = parseDataUrl(dataUrl);
  if (!img) return { saved: false, error: "Not a small JPEG, PNG or WebP image" };
  const db = createServiceClient();
  const { data: item } = await db.from("inventory_items").select("id, photo_path").eq("id", itemId).maybeSingle();
  if (!item) return { saved: false, error: "Item not found" };
  if (opts.onlyIfEmpty && item.photo_path) return { saved: false };

  const path = `${itemId}/${Date.now()}.${img.ext}`;
  let up = await db.storage.from(BUCKET).upload(path, img.bytes, { contentType: img.contentType, upsert: true });
  if (up.error && /not.?found|bucket/i.test(up.error.message)) {
    await ensureBucket();
    up = await db.storage.from(BUCKET).upload(path, img.bytes, { contentType: img.contentType, upsert: true });
  }
  if (up.error) return { saved: false, error: up.error.message };

  const now = new Date().toISOString();
  let q = db
    .from("inventory_items")
    .update({ photo_path: path, photo_source: source, photo_page: opts.page ?? null, photo_updated_at: now, photo_checked_at: now })
    .eq("id", itemId);
  // A web photo never replaces one that appeared meanwhile.
  if (opts.onlyIfEmpty) q = q.is("photo_path", null);
  const { data: updated, error } = await q.select("id");
  if (error || !updated?.length) {
    await db.storage.from(BUCKET).remove([path]);
    return { saved: false, error: error?.message };
  }
  if (item.photo_path && item.photo_path !== path) await db.storage.from(BUCKET).remove([item.photo_path as string]);
  return { saved: true };
}

export async function clearItemPhoto(itemId: string): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient();
  const { data: item } = await db.from("inventory_items").select("photo_path").eq("id", itemId).maybeSingle();
  const { error } = await db
    .from("inventory_items")
    .update({ photo_path: null, photo_source: null, photo_page: null, photo_updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  if (item?.photo_path) await db.storage.from(BUCKET).remove([item.photo_path as string]);
  return { ok: true };
}

export async function downloadItemPhoto(itemId: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const db = createServiceClient();
  const { data: item } = await db.from("inventory_items").select("photo_path").eq("id", itemId).maybeSingle();
  if (!item?.photo_path) return null;
  const { data, error } = await db.storage.from(BUCKET).download(item.photo_path as string);
  if (error || !data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  return { bytes, contentType: data.type || "image/jpeg" };
}

/** Mark that the web finder looked at an item (found or not), so it isn't paid for twice. */
export async function markPhotoChecked(itemId: string) {
  await createServiceClient().from("inventory_items").update({ photo_checked_at: new Date().toISOString() }).eq("id", itemId);
}
