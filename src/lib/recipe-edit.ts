import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { normUom } from "@/lib/recipes";

/**
 * Editing one recipe — its details and its ingredient lines. Shared by the
 * owner's actions and the staff actions (staff only with can_edit_recipes).
 * Each caller checks its own session first and says who is acting; staff
 * edits leave the price, on/off-menu and deletion to the owner.
 */

export type Actor = { id: string | null; type: "owner" | "barista" };
export type Result<T = object> = ({ ok: true } & T) | { ok?: false; error: string };
export type Db = ReturnType<typeof createServiceClient>;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const text = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s.slice(0, max) : null;
};
export const money = (v: unknown): number | null | "bad" => {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 10000) / 10000 : "bad";
};
export const amount = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 1000) / 1000 : null;
};

function audit(actor: Actor, action: string, entity_type: string, entity_id: string, before_state?: Record<string, unknown> | null, after_state?: Record<string, unknown> | null) {
  return writeAudit({ actor_id: actor.id, actor_type: actor.type, action, entity_type, entity_id, before_state: before_state ?? null, after_state: after_state ?? null });
}

/** May this staff member edit recipes? Read fresh each time so the owner's switch takes effect at once. */
export async function staffCanEditRecipes(baristaId: string): Promise<boolean> {
  const { data } = await createServiceClient().from("baristas").select("can_edit_recipes, is_active").eq("id", baristaId).maybeSingle();
  const r = data as { can_edit_recipes: boolean | null; is_active: boolean } | null;
  return !!r && r.is_active && r.can_edit_recipes === true;
}

/**
 * Name, section, method — and for the owner also the price and on/off menu.
 * Staff never change the price or take an item off the menu.
 */
export async function updateMenuItemCore(formData: FormData, actor: Actor): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Missing recipe." };
  const name = text(formData.get("name"), 120);
  if (!name) return { error: "Name is required." };
  const changes: Record<string, unknown> = {
    name,
    section: text(formData.get("section"), 60),
    method: text(formData.get("method"), 4000),
  };
  if (actor.type === "owner") {
    const price = money(formData.get("price"));
    if (price === "bad") return { error: "Price must be a number." };
    changes.price = price;
    changes.is_active = formData.get("is_active") === "on";
  }
  const db = createServiceClient();
  const { data: before } = await db.from("menu_items").select("name, section, price, method, is_active").eq("id", id).maybeSingle();
  if (!before) return { error: "Recipe not found." };
  const { error } = await db.from("menu_items").update(changes).eq("id", id);
  if (error) return { error: /uniq_menu_items/.test(error.message) ? `There is already a recipe called "${name}".` : error.message };
  await audit(actor, "updated", "menu_item", id, before as Record<string, unknown>, changes);
  return { ok: true };
}

/** A new recipe with no ingredients yet (the editor adds them one by one). */
export async function createMenuItemCore(formData: FormData, actor: Actor, locationId: string): Promise<Result<{ id: string }>> {
  const name = text(formData.get("name"), 120);
  if (!name) return { error: "Name is required." };
  const section = text(formData.get("section"), 60);
  const db = createServiceClient();
  const { data: dup } = await db.from("menu_items").select("id, name").eq("location_id", locationId).ilike("name", name.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (dup) return { error: `There is already a recipe called "${(dup as { name: string }).name}".` };
  const { data, error } = await db
    .from("menu_items")
    .insert({ location_id: locationId, name, section, source: "manual" })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not add." };
  const id = (data as { id: string }).id;
  await audit(actor, "created", "menu_item", id, null, { name, section, source: "manual" });
  return { ok: true, id };
}

export async function deleteMenuItemCore(id: string, actor: Actor): Promise<Result> {
  if (!UUID.test(id)) return { error: "Missing recipe." };
  const db = createServiceClient();
  const [{ data: before }, { data: lines }] = await Promise.all([
    db.from("menu_items").select("*").eq("id", id).maybeSingle(),
    db.from("recipe_lines").select("inventory_item_id, label, as_written, qty, uom, manual_unit_cost").eq("menu_item_id", id),
  ]);
  if (!before) return { error: "Recipe not found." };
  const { error } = await db.from("menu_items").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit(actor, "deleted", "menu_item", id, { ...(before as Record<string, unknown>), lines: lines ?? [] }, null);
  return { ok: true };
}

export async function addRecipeLineCore(formData: FormData, actor: Actor): Promise<Result<{ menuItemId: string }>> {
  const menuItemId = String(formData.get("menu_item_id") ?? "");
  if (!UUID.test(menuItemId)) return { error: "Missing recipe." };
  const rawItem = String(formData.get("inventory_item_id") ?? "");
  const itemId = UUID.test(rawItem) ? rawItem : null;
  const label = itemId ? null : text(formData.get("label"), 120);
  const qty = amount(formData.get("qty"));
  const uom = normUom(formData.get("uom"));
  if (!itemId && !label) return { error: "Pick an item or type a name." };
  if (!qty || !uom) return { error: "Amount and unit are required." };
  const db = createServiceClient();
  const { data: last } = await db.from("recipe_lines").select("position").eq("menu_item_id", menuItemId).order("position", { ascending: false }).limit(1).maybeSingle();
  const row = { menu_item_id: menuItemId, inventory_item_id: itemId, label, qty, uom, manual_unit_cost: formData.get("free") === "on" ? 0 : null, position: ((last?.position as number | undefined) ?? -1) + 1 };
  const { data, error } = await db.from("recipe_lines").insert(row).select("id").single();
  if (error || !data) return { error: error?.message ?? "Could not add." };
  await audit(actor, "created", "recipe_line", data.id as string, null, row);
  return { ok: true, menuItemId };
}

export async function updateRecipeLineCore(formData: FormData, actor: Actor): Promise<Result<{ menuItemId: string }>> {
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Missing ingredient." };
  const qty = amount(formData.get("qty"));
  const uom = normUom(formData.get("uom"));
  if (!qty || !uom) return { error: "Amount and unit are required." };
  const rawItem = String(formData.get("inventory_item_id") ?? "");
  const db = createServiceClient();
  const { data: before } = await db.from("recipe_lines").select("menu_item_id, inventory_item_id, label, qty, uom, manual_unit_cost").eq("id", id).maybeSingle();
  if (!before) return { error: "Ingredient not found." };
  const changes: Record<string, unknown> = { qty, uom };
  if (UUID.test(rawItem)) {
    changes.inventory_item_id = rawItem;
    changes.label = null;
  } else if (rawItem === "none") {
    const label = text(formData.get("label"), 120) ?? (before.label as string | null);
    if (!label) return { error: "Type a name for this ingredient." };
    changes.inventory_item_id = null;
    changes.label = label;
  }
  const { error } = await db.from("recipe_lines").update(changes).eq("id", id);
  if (error) return { error: error.message };
  await audit(actor, "updated", "recipe_line", id, before as Record<string, unknown>, changes);
  return { ok: true, menuItemId: before.menu_item_id as string };
}

export async function deleteRecipeLineCore(id: string, actor: Actor): Promise<Result<{ menuItemId: string }>> {
  if (!UUID.test(id)) return { error: "Missing ingredient." };
  const db = createServiceClient();
  const { data: before } = await db.from("recipe_lines").select("*").eq("id", id).maybeSingle();
  if (!before) return { error: "Ingredient not found." };
  const { error } = await db.from("recipe_lines").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit(actor, "deleted", "recipe_line", id, before as Record<string, unknown>, null);
  return { ok: true, menuItemId: (before as { menu_item_id: string }).menu_item_id };
}
