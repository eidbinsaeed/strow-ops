"use server";

import { revalidatePath } from "next/cache";
import { getBaristaSession } from "@/lib/auth/session";
import {
  addRecipeLineCore,
  createMenuItemCore,
  deleteRecipeLineCore,
  staffCanEditRecipes,
  updateMenuItemCore,
  updateRecipeLineCore,
  type Actor,
  type Result,
} from "@/lib/recipe-edit";

/**
 * Recipe edits by staff the owner has allowed (baristas.can_edit_recipes).
 * Ingredients, amounts, method, section and new recipes. The price, taking an
 * item off the menu and deleting a recipe stay with the owner.
 */

const NO = "The owner has not allowed you to edit recipes.";

async function actor(): Promise<Actor | string> {
  const session = await getBaristaSession();
  if (!session) return "Please log in again.";
  if (!(await staffCanEditRecipes(session.bid))) return NO;
  return { id: session.bid, type: "barista" };
}

function refresh(menuItemId?: string) {
  revalidatePath("/recipes");
  revalidatePath("/owner/recipes");
  if (menuItemId) {
    revalidatePath(`/recipes/${menuItemId}`);
    revalidatePath(`/owner/recipes/${menuItemId}`);
  }
}

export async function staffUpdateMenuItem(formData: FormData): Promise<Result> {
  const a = await actor();
  if (typeof a === "string") return { error: a };
  const r = await updateMenuItemCore(formData, a);
  if (r.ok) refresh(String(formData.get("id") ?? ""));
  return r;
}

export async function staffCreateMenuItem(formData: FormData): Promise<Result<{ id: string }>> {
  const session = await getBaristaSession();
  if (!session) return { error: "Please log in again." };
  if (!(await staffCanEditRecipes(session.bid))) return { error: NO };
  const r = await createMenuItemCore(formData, { id: session.bid, type: "barista" }, session.lid);
  if (r.ok) refresh(r.id);
  return r;
}

export async function staffAddRecipeLine(formData: FormData): Promise<Result> {
  const a = await actor();
  if (typeof a === "string") return { error: a };
  const r = await addRecipeLineCore(formData, a);
  if (r.ok) refresh(r.menuItemId);
  return r;
}

export async function staffUpdateRecipeLine(formData: FormData): Promise<Result> {
  const a = await actor();
  if (typeof a === "string") return { error: a };
  const r = await updateRecipeLineCore(formData, a);
  if (r.ok) refresh(r.menuItemId);
  return r;
}

export async function staffDeleteRecipeLine(id: string): Promise<Result> {
  const a = await actor();
  if (typeof a === "string") return { error: a };
  const r = await deleteRecipeLineCore(id, a);
  if (r.ok) refresh(r.menuItemId);
  return r;
}
