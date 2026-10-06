"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { baseOfUom, normUom, uomsForBase, type BaseUom, type RecipeSaveInput, type RecipeSource } from "@/lib/recipes";
import { latestPosPrices, savePosPrices } from "@/lib/recipes-pos";

type Result<T = object> = ({ ok: true } & T) | { ok?: false; error: string };
type Db = ReturnType<typeof createServiceClient>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCES: RecipeSource[] = ["photo", "text", "manual"];

// Server actions are reachable without going through the /owner page, so
// every one checks the owner session itself (not only the middleware).
async function owner(): Promise<boolean> {
  return !!(await getOwnerSession());
}

async function mainLocationId(db: Db): Promise<string | null> {
  const { data } = await db.from("locations").select("id").eq("slug", "qave_main").maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

function refresh(menuItemId?: string) {
  revalidatePath("/owner/recipes");
  if (menuItemId) revalidatePath(`/owner/recipes/${menuItemId}`);
}

function audit(action: string, entity_type: string, entity_id: string, before_state?: Record<string, unknown> | null, after_state?: Record<string, unknown> | null) {
  return writeAudit({ actor_id: null, actor_type: "owner", action, entity_type, entity_id, before_state: before_state ?? null, after_state: after_state ?? null });
}

const text = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s.slice(0, max) : null;
};
const money = (v: unknown): number | null | "bad" => {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 10000) / 10000 : "bad";
};
const amount = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 1000) / 1000 : null;
};

// ─── Save recipes from the review screen (photo / typed / manual) ────────────

type CleanLine = { inventory_item_id: string | null; label: string | null; as_written: string | null; qty: number; uom: string; manual_unit_cost: number | null };
type CleanRecipe = { key: string; name: string; section: string | null; price: number | null; method: string | null; source: RecipeSource; photo_drive_url: string | null; photo_drive_path: string | null; lines: CleanLine[] };

function validate(r: RecipeSaveInput, i: number): CleanRecipe | string {
  const name = text(r?.name, 120);
  if (!name) return `Recipe ${i + 1}: name is required.`;
  const price = money(r.price);
  if (price === "bad") return `${name}: price must be a number.`;
  if (!Array.isArray(r.lines) || r.lines.length === 0) return `${name}: add at least one ingredient.`;
  if (r.lines.length > 60) return `${name}: too many ingredients.`;
  const lines: CleanLine[] = [];
  for (const [j, l] of r.lines.entries()) {
    const uom = normUom(l?.uom);
    const qty = amount(l?.qty);
    const itemId = typeof l?.inventory_item_id === "string" && UUID.test(l.inventory_item_id) ? l.inventory_item_id : null;
    const label = text(l?.label, 120);
    if (!itemId && !label) return `${name}, line ${j + 1}: pick an item or type a name.`;
    if (!qty || !uom) return `${name}, line ${j + 1}: amount and unit are required.`;
    lines.push({ inventory_item_id: itemId, label: itemId ? null : label, as_written: text(l.as_written, 300), qty, uom, manual_unit_cost: l.free ? 0 : null });
  }
  const photoUrl = text(r.photo_drive_url, 400);
  return {
    key: String(r.key ?? i),
    name,
    section: text(r.section, 60),
    price,
    method: text(r.method, 4000),
    source: SOURCES.includes(r.source) ? r.source : "manual",
    photo_drive_url: photoUrl && photoUrl.startsWith("https://drive.google.com/") ? photoUrl : null,
    photo_drive_path: photoUrl ? text(r.photo_drive_path, 400) : null,
    lines,
  };
}

export type SaveResult = { ok: boolean; saved: { key: string; id: string; replaced: boolean }[]; error?: string };

export async function saveRecipes(recipes: RecipeSaveInput[]): Promise<SaveResult> {
  const saved: SaveResult["saved"] = [];
  const fail = (error: string): SaveResult => {
    if (saved.length) refresh();
    return { ok: false, saved, error };
  };
  if (!(await owner())) return fail("Please sign in again.");
  if (!Array.isArray(recipes) || recipes.length === 0) return fail("Nothing to save.");
  if (recipes.length > 40) return fail("Save at most 40 recipes at a time.");

  const clean: CleanRecipe[] = [];
  for (const [i, r] of recipes.entries()) {
    const v = validate(r, i);
    if (typeof v === "string") return fail(v);
    clean.push(v);
  }

  const db = createServiceClient();
  const locationId = await mainLocationId(db);
  if (!locationId) return fail("Location not found.");

  // Every linked item must exist.
  const ids = [...new Set(clean.flatMap((r) => r.lines.map((l) => l.inventory_item_id)).filter((x): x is string => !!x))];
  if (ids.length) {
    const { data } = await db.from("inventory_items").select("id").in("id", ids);
    const found = new Set((data ?? []).map((d) => d.id as string));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) return fail("One of the chosen items no longer exists. Pick it again.");
  }

  const { data: existingRows, error: menuError } = await db.from("menu_items").select("id, name, section, price, method").eq("location_id", locationId);
  if (menuError) return fail(menuError.message);
  const existing = new Map((existingRows ?? []).map((m) => [String(m.name).trim().toLowerCase(), m as { id: string; name: string; section: string | null; price: number | null; method: string | null }]));

  for (const r of clean) {
    const prev = existing.get(r.name.toLowerCase());
    const lineRows = (menuItemId: string) => r.lines.map((l, position) => ({ ...l, menu_item_id: menuItemId, position }));

    if (prev) {
      // Replace safely: add the new lines first, then remove the old ones.
      const { data: oldLines } = await db.from("recipe_lines").select("id, inventory_item_id, label, qty, uom").eq("menu_item_id", prev.id);
      const { error: insErr } = await db.from("recipe_lines").insert(lineRows(prev.id));
      if (insErr) return fail(`${r.name}: ${insErr.message}`);
      const oldIds = (oldLines ?? []).map((l) => l.id as string);
      if (oldIds.length) await db.from("recipe_lines").delete().in("id", oldIds);
      const changes: Record<string, unknown> = { name: r.name, source: r.source };
      if (r.section) changes.section = r.section;
      if (r.price != null) changes.price = r.price;
      if (r.method) changes.method = r.method;
      if (r.photo_drive_url) {
        changes.photo_drive_url = r.photo_drive_url;
        changes.photo_drive_path = r.photo_drive_path;
      }
      await db.from("menu_items").update(changes).eq("id", prev.id);
      await audit("recipe_replaced", "menu_item", prev.id, { ...prev, lines: oldLines ?? [] }, { ...changes, lines: r.lines });
      saved.push({ key: r.key, id: prev.id, replaced: true });
      continue;
    }

    const { data: created, error: createErr } = await db
      .from("menu_items")
      .insert({
        location_id: locationId,
        name: r.name,
        section: r.section,
        price: r.price,
        method: r.method,
        source: r.source,
        photo_drive_url: r.photo_drive_url,
        photo_drive_path: r.photo_drive_path,
      })
      .select("id")
      .single();
    if (createErr || !created) return fail(`${r.name}: ${createErr?.message ?? "could not save"}`);
    const { error: linesErr } = await db.from("recipe_lines").insert(lineRows(created.id as string));
    if (linesErr) {
      await db.from("menu_items").delete().eq("id", created.id);
      return fail(`${r.name}: ${linesErr.message}`);
    }
    existing.set(r.name.toLowerCase(), { id: created.id as string, name: r.name, section: r.section, price: r.price, method: r.method });
    await audit("created", "menu_item", created.id as string, null, { name: r.name, section: r.section, price: r.price, source: r.source, lines: r.lines });
    saved.push({ key: r.key, id: created.id as string, replaced: false });
  }

  refresh();
  for (const s of saved) revalidatePath(`/owner/recipes/${s.id}`);
  return { ok: true, saved };
}

// ─── Edit one recipe ─────────────────────────────────────────────────────────

export async function updateMenuItem(formData: FormData): Promise<Result> {
  if (!(await owner())) return { error: "Please sign in again." };
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Missing recipe." };
  const name = text(formData.get("name"), 120);
  if (!name) return { error: "Name is required." };
  const price = money(formData.get("price"));
  if (price === "bad") return { error: "Price must be a number." };
  const changes = {
    name,
    section: text(formData.get("section"), 60),
    price,
    method: text(formData.get("method"), 4000),
    is_active: formData.get("is_active") === "on",
  };
  const db = createServiceClient();
  const { data: before } = await db.from("menu_items").select("name, section, price, method, is_active").eq("id", id).maybeSingle();
  if (!before) return { error: "Recipe not found." };
  const { error } = await db.from("menu_items").update(changes).eq("id", id);
  if (error) return { error: /uniq_menu_items/.test(error.message) ? `There is already a recipe called "${name}".` : error.message };
  await audit("updated", "menu_item", id, before, changes);
  refresh(id);
  return { ok: true };
}

export async function deleteMenuItem(id: string): Promise<Result> {
  if (!(await owner())) return { error: "Please sign in again." };
  if (!UUID.test(id)) return { error: "Missing recipe." };
  const db = createServiceClient();
  const [{ data: before }, { data: lines }] = await Promise.all([
    db.from("menu_items").select("*").eq("id", id).maybeSingle(),
    db.from("recipe_lines").select("inventory_item_id, label, as_written, qty, uom, manual_unit_cost").eq("menu_item_id", id),
  ]);
  if (!before) return { error: "Recipe not found." };
  const { error } = await db.from("menu_items").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("deleted", "menu_item", id, { ...before, lines: lines ?? [] }, null);
  refresh();
  return { ok: true };
}

export async function addRecipeLine(formData: FormData): Promise<Result> {
  if (!(await owner())) return { error: "Please sign in again." };
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
  await audit("created", "recipe_line", data.id as string, null, row);
  refresh(menuItemId);
  return { ok: true };
}

export async function updateRecipeLine(formData: FormData): Promise<Result> {
  if (!(await owner())) return { error: "Please sign in again." };
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
  await audit("updated", "recipe_line", id, before, changes);
  refresh(before.menu_item_id as string);
  return { ok: true };
}

export async function deleteRecipeLine(id: string): Promise<Result> {
  if (!(await owner())) return { error: "Please sign in again." };
  if (!UUID.test(id)) return { error: "Missing ingredient." };
  const db = createServiceClient();
  const { data: before } = await db.from("recipe_lines").select("*").eq("id", id).maybeSingle();
  if (!before) return { error: "Ingredient not found." };
  const { error } = await db.from("recipe_lines").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit("deleted", "recipe_line", id, before, null);
  refresh(before.menu_item_id as string);
  return { ok: true };
}

// ─── Finish the costs: fix an ingredient once, every recipe updates ─────────

/** "1 bucket = 3.2 kg" — the item's pack size, so per-piece purchases become per kg / L. */
export async function setPackSize(formData: FormData): Promise<Result> {
  if (!(await owner())) return { error: "Please sign in again." };
  const itemId = String(formData.get("inventory_item_id") ?? "");
  const size = amount(formData.get("size"));
  const uom = normUom(formData.get("uom"));
  if (!UUID.test(itemId)) return { error: "Missing item." };
  if (!size || !uom || uom === "pcs") return { error: "Enter the size in g, kg, ml or L." };
  const db = createServiceClient();
  const { data: before } = await db.from("inventory_items").select("name, default_unit_size, default_size_uom").eq("id", itemId).maybeSingle();
  if (!before) return { error: "Item not found." };
  const changes = { default_unit_size: size, default_size_uom: uom };
  const { error } = await db.from("inventory_items").update(changes).eq("id", itemId);
  if (error) return { error: error.message };
  await audit("set_pack_size", "inventory_item", itemId, before, changes);
  refresh();
  revalidatePath("/owner/items");
  return { ok: true };
}

/** Owner's price per kg / L / pc for lines that have no usable bill yet (item or free-text name). */
export async function setManualPrice(formData: FormData): Promise<Result> {
  if (!(await owner())) return { error: "Please sign in again." };
  const itemId = String(formData.get("inventory_item_id") ?? "");
  const label = text(formData.get("label"), 120);
  const base = String(formData.get("base") ?? "") as BaseUom;
  const cost = money(formData.get("cost"));
  if (!["kg", "L", "pcs"].includes(base)) return { error: "Missing unit." };
  if (cost === "bad" || cost == null) return { error: "Enter a price (0 is fine for free things)." };
  if (!UUID.test(itemId) && !label) return { error: "Missing ingredient." };
  const db = createServiceClient();
  let q = db.from("recipe_lines").update({ manual_unit_cost: cost }).in("uom", uomsForBase(base));
  q = UUID.test(itemId) ? q.eq("inventory_item_id", itemId) : q.is("inventory_item_id", null).ilike("label", label!.replace(/[%_\\]/g, "\\$&"));
  const { data, error } = await q.select("id");
  if (error) return { error: error.message };
  const target = UUID.test(itemId) ? itemId : (data?.[0]?.id as string | undefined);
  if (target) await audit("set_manual_price", UUID.test(itemId) ? "inventory_item" : "recipe_line", target, null, { inventory_item_id: UUID.test(itemId) ? itemId : null, label, base, cost, lines: (data ?? []).length });
  refresh();
  return { ok: true };
}

/** Link free-text lines ("Condensed milk") to a stock item, everywhere. */
export async function linkLabelToItem(formData: FormData): Promise<Result> {
  if (!(await owner())) return { error: "Please sign in again." };
  const label = text(formData.get("label"), 120);
  const itemId = String(formData.get("inventory_item_id") ?? "");
  if (!label || !UUID.test(itemId)) return { error: "Pick an item." };
  const db = createServiceClient();
  const { data, error } = await db
    .from("recipe_lines")
    .update({ inventory_item_id: itemId, label: null })
    .is("inventory_item_id", null)
    .ilike("label", label.replace(/[%_\\]/g, "\\$&"))
    .select("id");
  if (error) return { error: error.message };
  await audit("linked_item", "recipe_line", itemId, { label }, { inventory_item_id: itemId, lines: (data ?? []).length });
  refresh();
  return { ok: true };
}

/** "1 banana = 120 g": recipes that count pieces of an item bought by weight / volume. */
export async function convertPieces(formData: FormData): Promise<Result> {
  if (!(await owner())) return { error: "Please sign in again." };
  const itemId = String(formData.get("inventory_item_id") ?? "");
  const per = amount(formData.get("per_piece"));
  const uom = normUom(formData.get("uom"));
  if (!UUID.test(itemId)) return { error: "Missing item." };
  if (!per || !uom || uom === "pcs") return { error: "Enter the weight or volume of one piece." };
  const db = createServiceClient();
  const { data: lines } = await db.from("recipe_lines").select("id, menu_item_id, qty, uom").eq("inventory_item_id", itemId).eq("uom", "pcs");
  for (const l of lines ?? []) {
    const qty = Math.round(Number(l.qty) * per * 1000) / 1000;
    await db.from("recipe_lines").update({ qty, uom }).eq("id", l.id);
  }
  await audit("converted_pieces", "inventory_item", itemId, null, { per_piece: per, uom, lines: (lines ?? []).length });
  refresh();
  return { ok: true };
}

/** Recipe says ml but the item is bought per kg (or g vs L): switch, 1 ml ≈ 1 g. */
export async function switchUnit(formData: FormData): Promise<Result> {
  if (!(await owner())) return { error: "Please sign in again." };
  const itemId = String(formData.get("inventory_item_id") ?? "");
  const to = String(formData.get("to") ?? "") as BaseUom;
  if (!UUID.test(itemId) || (to !== "kg" && to !== "L")) return { error: "Missing item." };
  const db = createServiceClient();
  const from = to === "kg" ? "L" : "kg";
  const { data: lines } = await db.from("recipe_lines").select("id, uom").eq("inventory_item_id", itemId).in("uom", uomsForBase(from));
  const map: Record<string, string> = to === "kg" ? { ml: "g", L: "kg" } : { g: "ml", kg: "L" };
  for (const l of lines ?? []) {
    const next = map[String(l.uom)];
    if (next && baseOfUom(normUom(next)!) === to) await db.from("recipe_lines").update({ uom: next }).eq("id", l.id);
  }
  await audit("switched_unit", "inventory_item", itemId, null, { to, lines: (lines ?? []).length });
  refresh();
  return { ok: true };
}

// ─── Selling prices from the POS ─────────────────────────────────────────────

/** Use the price the POS charged on the latest day this item sold. */
export async function applyPosPrice(menuItemId: string): Promise<Result<{ price: number }>> {
  if (!(await owner())) return { error: "Please sign in again." };
  if (!UUID.test(menuItemId)) return { error: "Missing recipe." };
  const db = createServiceClient();
  const [{ data: before }, prices] = await Promise.all([
    db.from("menu_items").select("price").eq("id", menuItemId).maybeSingle(),
    latestPosPrices(db, [menuItemId]),
  ]);
  if (!before) return { error: "Recipe not found." };
  const pos = prices.get(menuItemId);
  if (!pos) return { error: "The POS reports have no sale of this item yet." };
  const res = await savePosPrices(db, [{ id: menuItemId, price: pos.unit, date: pos.date }]);
  if (res.error) return { error: res.error };
  await audit("price_from_pos", "menu_item", menuItemId, { price: before.price }, { price: pos.unit, pos_date: pos.date });
  refresh(menuItemId);
  return { ok: true, price: pos.unit };
}

/** Every menu item without a price that the POS has sold gets the POS price. */
export async function fillPricesFromPos(): Promise<Result<{ filled: number }>> {
  if (!(await owner())) return { error: "Please sign in again." };
  const db = createServiceClient();
  const [{ data: items, error }, prices] = await Promise.all([
    db.from("menu_items").select("id, name, price").is("price", null),
    latestPosPrices(db),
  ]);
  if (error) return { error: error.message };
  const todo = ((items ?? []) as { id: string; name: string }[])
    .filter((m) => prices.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, price: prices.get(m.id)!.unit, date: prices.get(m.id)!.date }));
  if (!todo.length) return { ok: true, filled: 0 };
  const res = await savePosPrices(db, todo);
  if (res.error) return { error: res.error };
  for (const t of todo) await audit("price_from_pos", "menu_item", t.id, { price: null }, { price: t.price, pos_date: t.date });
  refresh();
  for (const t of todo) revalidatePath(`/owner/recipes/${t.id}`);
  return { ok: true, filled: todo.length };
}
