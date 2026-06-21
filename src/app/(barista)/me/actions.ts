"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadStaffPhoto } from "@/lib/storage/staff-photo";
import { writeAudit } from "@/lib/audit/log";

export async function updateMyProfile(formData: FormData) {
  const session = await getBaristaSession();
  if (!session) return { error: "Not signed in" };

  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const photoDataUrl = String(formData.get("photo_data_url") ?? "").trim();

  if (phoneRaw && !/^[+\d][\d\s-]{5,19}$/.test(phoneRaw)) {
    return { error: "Enter a valid phone number" };
  }

  const supabase = createServiceClient();
  const patch: Record<string, unknown> = { phone: phoneRaw || null };

  if (photoDataUrl.startsWith("data:image/")) {
    const path = await uploadStaffPhoto(session.bid, photoDataUrl);
    if (path) patch.photo_url = path;
  }

  const { error } = await supabase
    .from("baristas")
    .update(patch)
    .eq("id", session.bid);
  if (error) return { error: error.message };

  await writeAudit({
    actor_id: session.bid,
    actor_type: "barista",
    action: "profile_updated",
    entity_type: "barista",
    entity_id: session.bid,
  });

  revalidatePath("/me");
  return { ok: true };
}

export async function changeMyPassword(formData: FormData) {
  const session = await getBaristaSession();
  if (!session) return { error: "Not signed in" };

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  if (next.length < 4 || next.length > 72) {
    return { error: "New password must be at least 4 characters" };
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("baristas")
    .select("pin_hash")
    .eq("id", session.bid)
    .maybeSingle();
  const row = data as { pin_hash: string } | null;
  if (!row) return { error: "Account not found" };

  const ok = await bcrypt.compare(current, row.pin_hash);
  if (!ok) return { error: "Current password is incorrect" };

  const pin_hash = await bcrypt.hash(next, 10);
  const { error } = await supabase
    .from("baristas")
    .update({ pin_hash })
    .eq("id", session.bid);
  if (error) return { error: error.message };

  await writeAudit({
    actor_id: session.bid,
    actor_type: "barista",
    action: "password_changed",
    entity_type: "barista",
    entity_id: session.bid,
  });

  revalidatePath("/me");
  return { ok: true };
}
