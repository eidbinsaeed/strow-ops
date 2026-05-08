"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("suppliers").insert({
    location_id: location.id,
    name,
    trn,
    category_id,
    contact,
    notes,
  });

  if (error) return { error: error.message };
  revalidatePath("/owner/suppliers");
  revalidatePath("/owner");
  return { ok: true };
}

export async function deleteSupplier(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/owner/suppliers");
  revalidatePath("/owner");
  return { ok: true };
}
