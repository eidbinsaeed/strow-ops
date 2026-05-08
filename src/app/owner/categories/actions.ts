"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const parent_id = String(formData.get("parent_id") ?? "").trim() || null;

  if (!name) return { error: "Name is required" };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("categories")
    .insert({ name, parent_id, is_active: true });

  if (error) return { error: error.message };
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
  revalidatePath("/owner/categories");
  revalidatePath("/owner");
  return { ok: true };
}
