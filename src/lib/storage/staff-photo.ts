/**
 * Staff account photos — stored in the private `staff-photos` bucket.
 * Used for the staff profile and (later) printed ID cards.
 */
import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "staff-photos";

/** Upload a base64 data URL as the staff photo. Returns the storage path. */
export async function uploadStaffPhoto(
  baristaId: string,
  dataUrl: string,
): Promise<string | null> {
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1];
  const ext = contentType.split("/")[1].replace("jpeg", "jpg").replace("+xml", "");
  const buffer = Buffer.from(m[2], "base64");
  const path = `${baristaId}.${ext}`;

  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) {
    console.error("[staff-photo] upload:", error);
    return null;
  }
  return path;
}

/** Short-lived signed URL for displaying a staff photo (bucket is private). */
export async function signedStaffPhotoUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}
