/**
 * Supplier logos — kept in the private `supplier-logos` bucket, one small
 * image per supplier, served by /api/supplier-logo/[id].
 *
 * Where they come from:
 *  - "bill": cut from the top of the supplier's own bill photo (the bill reader
 *    says where the logo is; the browser cuts it out). Only fills an empty slot.
 *  - "upload": added or replaced by hand on the Vendors page. Always wins.
 */
import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "supplier-logos";
const MAX_BYTES = 400_000;

export type LogoSource = "bill" | "upload";

function parseDataUrl(dataUrl: string): { contentType: string; ext: string; bytes: Buffer } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  const bytes = Buffer.from(m[2], "base64");
  if (!bytes.length || bytes.length > MAX_BYTES) return null;
  return { contentType: m[1], ext: m[1] === "image/jpeg" ? "jpg" : m[1].slice(6), bytes };
}

async function ensureBucket() {
  const db = createServiceClient();
  const { error } = await db.storage.createBucket(BUCKET, { public: false });
  if (error && !/exist/i.test(error.message)) throw error;
}

/**
 * Save a logo for a supplier. With onlyIfEmpty (logos from bills), a supplier
 * that already has a logo keeps it. Returns whether a logo was saved.
 */
export async function saveSupplierLogo(
  supplierId: string,
  dataUrl: string,
  source: LogoSource,
  opts: { onlyIfEmpty?: boolean } = {},
): Promise<{ saved: boolean; error?: string }> {
  const img = parseDataUrl(dataUrl);
  if (!img) return { saved: false, error: "Not a small JPEG, PNG or WebP image" };
  const db = createServiceClient();
  const { data: sup } = await db.from("suppliers").select("id, logo_path").eq("id", supplierId).maybeSingle();
  if (!sup) return { saved: false, error: "Supplier not found" };
  if (opts.onlyIfEmpty && sup.logo_path) return { saved: false };

  const path = `${supplierId}/${Date.now()}.${img.ext}`;
  let up = await db.storage.from(BUCKET).upload(path, img.bytes, { contentType: img.contentType, upsert: true });
  if (up.error && /not.?found|bucket/i.test(up.error.message)) {
    await ensureBucket();
    up = await db.storage.from(BUCKET).upload(path, img.bytes, { contentType: img.contentType, upsert: true });
  }
  if (up.error) return { saved: false, error: up.error.message };

  let q = db
    .from("suppliers")
    .update({ logo_path: path, logo_source: source, logo_updated_at: new Date().toISOString() })
    .eq("id", supplierId);
  // A logo from a bill never replaces one that appeared meanwhile.
  if (opts.onlyIfEmpty) q = q.is("logo_path", null);
  const { data: updated, error } = await q.select("id");
  if (error || !updated?.length) {
    await db.storage.from(BUCKET).remove([path]);
    return { saved: false, error: error?.message };
  }
  if (sup.logo_path && sup.logo_path !== path) await db.storage.from(BUCKET).remove([sup.logo_path as string]);
  return { saved: true };
}

export async function clearSupplierLogo(supplierId: string): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient();
  const { data: sup } = await db.from("suppliers").select("logo_path").eq("id", supplierId).maybeSingle();
  const { error } = await db
    .from("suppliers")
    .update({ logo_path: null, logo_source: null, logo_updated_at: new Date().toISOString() })
    .eq("id", supplierId);
  if (error) return { ok: false, error: error.message };
  if (sup?.logo_path) await db.storage.from(BUCKET).remove([sup.logo_path as string]);
  return { ok: true };
}

export async function downloadSupplierLogo(supplierId: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const db = createServiceClient();
  const { data: sup } = await db.from("suppliers").select("logo_path").eq("id", supplierId).maybeSingle();
  if (!sup?.logo_path) return null;
  const { data, error } = await db.storage.from(BUCKET).download(sup.logo_path as string);
  if (error || !data) return null;
  return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || "image/jpeg" };
}
