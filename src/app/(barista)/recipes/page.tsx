import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { staffCanEditRecipes } from "@/lib/recipe-edit";
import { SECTION_SUGGESTIONS } from "@/lib/recipes";
import { NewRecipeForm } from "./NewRecipeForm";

export const dynamic = "force-dynamic";

const SECTION_ORDER = ["Hot coffee", "Iced coffee", "V60", "Matcha", "Tea", "Hot drinks", "Cold drinks", "Smoothies", "Bowls", "Desserts", "Bakery", "Bakery & breakfast", "Water & soft drinks"];

type Row = { id: string; name: string; section: string | null; is_active: boolean; source: string };

/** Recipes for staff the owner has allowed (baristas.can_edit_recipes): the menu by section, tap to edit. */
export default async function StaffRecipesPage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const header = (
    <header className="flex items-center gap-3">
      <Link href="/home" aria-label="Back to home" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-300 bg-white text-strow-ink">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Menu</p>
        <h1 className="font-display text-2xl font-bold">Recipes</h1>
      </div>
    </header>
  );

  if (!(await staffCanEditRecipes(session.bid))) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
        {header}
        <p className="rounded-2xl bg-white p-4 text-sm text-neutral-600">The owner has not allowed you to edit recipes.</p>
      </main>
    );
  }

  const db = createServiceClient();
  const [menuRes, linesRes] = await Promise.all([
    db.from("menu_items").select("id, name, section, is_active, source").eq("location_id", session.lid).order("name"),
    db.from("recipe_lines").select("menu_item_id"),
  ]);
  const lineCount = new Map<string, number>();
  for (const l of (linesRes.data ?? []) as { menu_item_id: string }[]) lineCount.set(l.menu_item_id, (lineCount.get(l.menu_item_id) ?? 0) + 1);

  const menu = ((menuRes.data ?? []) as Row[]).filter((m) => m.is_active);
  const groups = new Map<string, Row[]>();
  for (const m of menu) {
    const k = m.section?.trim() || "Other";
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const rank = (s: string) => {
    const i = SECTION_ORDER.indexOf(s);
    return i >= 0 ? i : s === "Other" ? 1000 : 500;
  };
  const ordered = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  const noRecipe = menu.filter((m) => !lineCount.get(m.id)).length;
  const sections = [...new Set([...menu.map((m) => m.section).filter((s): s is string => !!s), ...SECTION_SUGGESTIONS])];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
      {header}
      <p className="rounded-2xl bg-white p-4 text-sm text-neutral-600">
        {menu.length} items on the menu{noRecipe ? ` · ${noRecipe} without a recipe yet` : ""}. Tap an item to change its ingredients, amounts or method. The owner sees every change.
      </p>

      <NewRecipeForm sections={sections} />

      {menuRes.error ? <p className="rounded-2xl bg-[#FBE9E7] p-4 text-sm text-[#9A1B12]">{menuRes.error.message}</p> : null}

      {ordered.map(([section, items]) => (
        <section key={section} className="flex flex-col gap-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{section}</h2>
          <div className="overflow-hidden rounded-2xl border border-neutral-300 bg-white">
            {items.map((m, i) => {
              const n = lineCount.get(m.id) ?? 0;
              return (
                <Link
                  key={m.id}
                  href={`/recipes/${m.id}` as Route}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${i ? "border-t border-[#EEF1F4]" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-strow-ink">{m.name}</span>
                    <span className={`block text-xs ${n ? "text-neutral-500" : "font-semibold text-strow-amber"}`}>{n ? `${n} ingredient${n === 1 ? "" : "s"}` : "No recipe yet · add the ingredients"}</span>
                  </span>
                  <span className="text-neutral-400" aria-hidden="true">
                    ›
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
