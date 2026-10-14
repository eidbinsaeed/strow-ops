import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { staffCanEditRecipes, UUID } from "@/lib/recipe-edit";
import { AddLineForm, DetailsEditor, LineRow, RecipePhoto, type RecipeActions } from "@/app/owner/recipes/RecipeEditor";
import { NON_INGREDIENT_KINDS, SECTION_SUGGESTIONS, driveFileId, normLine, type BaseUom, type ItemOption } from "@/lib/recipes";
import { staffAddRecipeLine, staffDeleteRecipeLine, staffUpdateMenuItem, staffUpdateRecipeLine } from "../actions";

export const dynamic = "force-dynamic";

const ACTIONS: RecipeActions = {
  updateMenuItem: staffUpdateMenuItem,
  addRecipeLine: staffAddRecipeLine,
  updateRecipeLine: staffUpdateRecipeLine,
  deleteRecipeLine: staffDeleteRecipeLine,
};

/** One recipe for staff: ingredients, amounts, method, section. No costs, no price, no delete. */
export default async function StaffRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getBaristaSession();
  if (!session) redirect("/login");
  if (!(await staffCanEditRecipes(session.bid))) redirect("/recipes" as Route);

  const db = createServiceClient();
  const [itemRes, linesRes, itemsRes, unitRes, sectionsRes] = await Promise.all([
    db.from("menu_items").select("id, name, section, price, method, is_active, source, photo_drive_url, location_id").eq("id", id).maybeSingle(),
    db.from("v_recipe_line_costs").select("*").eq("menu_item_id", id).order("position"),
    db.from("inventory_items").select("id, name, kind, unit, default_unit_size, default_size_uom, is_active").eq("location_id", session.lid).order("name"),
    db.from("v_item_unit_cost").select("inventory_item_id, base_uom"),
    db.from("menu_items").select("section").eq("location_id", session.lid),
  ]);
  const item = itemRes.data as { id: string; name: string; section: string | null; price: number | null; method: string | null; is_active: boolean; source: string; photo_drive_url: string | null; location_id: string } | null;
  if (!item || item.location_id !== session.lid) notFound();

  const lines = (linesRes.data ?? []).map((r) => normLine(r as Record<string, unknown>));
  const base = new Map(((unitRes.data ?? []) as { inventory_item_id: string; base_uom: string }[]).map((u) => [u.inventory_item_id, u.base_uom as BaseUom]));
  const pickable: ItemOption[] = ((itemsRes.data ?? []) as Record<string, unknown>[])
    .filter((i) => i.is_active !== false && !NON_INGREDIENT_KINDS.has(String(i.kind ?? "other")))
    .map((i) => ({
      id: String(i.id),
      name: String(i.name),
      kind: String(i.kind ?? "other"),
      unit: (i.unit as string | null) ?? null,
      base: base.get(String(i.id)) ?? null,
      packSize: i.default_unit_size != null ? Number(i.default_unit_size) : null,
      packUom: (i.default_size_uom as string | null) ?? null,
    }));
  const sections = [...new Set([...((sectionsRes.data ?? []) as { section: string | null }[]).map((s) => s.section).filter((s): s is string => !!s), ...SECTION_SUGGESTIONS])];
  const fileId = driveFileId(item.photo_drive_url);
  const steps = (item.method ?? "").split(/\n+/).map((s) => s.trim()).filter(Boolean);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
      <header className="flex items-center gap-3">
        <Link href={"/recipes" as Route} aria-label="Back to recipes" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-300 bg-white text-strow-ink">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {item.section ?? "Other"}
            {!item.is_active ? " · off the menu" : ""}
          </p>
          <h1 className="font-display text-2xl font-bold leading-tight">{item.name}</h1>
        </div>
      </header>

      {fileId ? (
        <div className="px-1">
          <RecipePhoto fileId={fileId} name={item.name} />
        </div>
      ) : null}

      <section className="rounded-2xl border border-neutral-300 bg-white px-4 pb-4 pt-4">
        <h2 className="pb-1 font-display text-lg font-semibold">Ingredients</h2>
        {lines.length === 0 ? <p className="pb-2 text-sm text-neutral-500">No ingredients yet. Add them below, one by one, the way the drink is made.</p> : null}
        {lines.map((l) => (
          <LineRow key={l.id} line={l} items={pickable} actions={ACTIONS} showCost={false} />
        ))}
        <AddLineForm menuItemId={item.id} items={pickable} actions={ACTIONS} />
        <p className="mt-3 text-xs text-neutral-500">Pick the stock item so the owner&apos;s costs stay right; type a name only for things not in stock (ice, water).</p>
      </section>

      {steps.length ? (
        <section className="rounded-2xl border border-neutral-300 bg-white px-4 py-4">
          <h2 className="pb-2 font-display text-lg font-semibold">Method</h2>
          <ol className="list-decimal space-y-1.5 ps-5 text-[15px] leading-relaxed">
            {steps.map((s, i) => (
              <li key={i} dir="auto">
                {s.replace(/^\d+[.)]\s*/, "")}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <DetailsEditor
        item={{ id: item.id, name: item.name, section: item.section, price: item.price != null ? Number(item.price) : null, method: item.method, is_active: item.is_active }}
        sections={sections}
        actions={ACTIONS}
        mode="staff"
        open={lines.length === 0 && !item.method}
      />
      <p className="pb-4 text-center text-xs text-neutral-500">Prices and taking an item off the menu are the owner&apos;s.</p>
    </main>
  );
}
