"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/server";

const PIN_REGEX = /^\d{4}$/;

export async function createBarista(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "barista").trim() || "barista";
  const pin = String(formData.get("pin") ?? "").trim();

  if (!name) return { error: "Name is required" };
  if (!PIN_REGEX.test(pin)) return { error: "PIN must be exactly 4 digits" };

  const supabase = createServiceClient();

  // Default to qave_main location for now (multi-location UI ships later)
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("slug", "qave_main")
    .single();

  if (!location) return { error: "Default location not found" };

  const pin_hash = await bcrypt.hash(pin, 10);

  const { error } = await supabase.from("baristas").insert({
    location_id: location.id,
    name,
    role,
    pin_hash,
    is_active: true,
    is_on_shift: false,
  });

  if (error) return { error: error.message };

  revalidatePath("/owner/baristas");
  revalidatePath("/owner");
  return { ok: true };
}

export async function toggleOnShift(id: string, currentlyOn: boolean) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("baristas")
    .update({ is_on_shift: !currentlyOn })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/owner/baristas");
  revalidatePath("/owner");
  return { ok: true };
}

export async function rotateBaristaPin(id: string, newPin: string) {
  if (!PIN_REGEX.test(newPin)) {
    return { error: "PIN must be exactly 4 digits" };
  }
  const supabase = createServiceClient();
  const pin_hash = await bcrypt.hash(newPin, 10);
  const { error } = await supabase
    .from("baristas")
    .update({ pin_hash })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/owner/baristas");
  return { ok: true };
}

export async function deactivateBarista(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("baristas")
    .update({ is_active: false, is_on_shift: false })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/owner/baristas");
  revalidatePath("/owner");
  return { ok: true };
}

export async function reactivateBarista(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("baristas")
    .update({ is_active: true })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/owner/baristas");
  return { ok: true };
}
