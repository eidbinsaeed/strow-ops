import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { RecipeIntake } from "./RecipeIntake";
import { CostFixes } from "./RecipeFixes";
import {
  NON_INGREDIENT_KINDS,
  SECTION_SUGGESTIONS,
  aed,
  buildIssues,
  marginTone,
  normLine,
  normMenu,
  rt,
  type BaseUom,
  type ItemOption,
  type MenuCostRow,
} from "@/lib/recipes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RecipesPage() {
  const locale = await getLocale();
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const db = createServiceClient();

  const [menuRes, linesRes, itemsRes, unitRes] = await Promise.all([
    db.from("v_menu_item_costs").select("*").order("name"),
    db.from("v_recipe_line_costs").select("*").is("line_cost", null),
    db.from("inventory_items").select("id, name, kind, unit, default_unit_size, default_size_uom, is_active").order("name"),
    db.from("v_item_unit_cost").select("inventory_item_id, base_uom"),
  ]);

  if (menuRes.error) {
    return (
      <div className="page">
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{t("title")}</h1>
        <p className="mt-4 rounded-[24px] bg-red-50 p-5 text-sm text-red-700">
          Recipes are not set up in the database yet — apply migration 0018_recipes.sql. ({menuRes.error.message})
        </p>
      </div>
    );
  }

  const menu = (menuRes.data ?? []).map((r) => normMenu(r as Record<string, unknown>));
  const base = new Map(((unitRes.data ?? []) as { inventory_item_id: string; base_uom: string }[]).map((u) => [u.inventory_item_id, u.base_uom as BaseUom]));
  const allItems: (ItemOption & { active: boolean })[] = ((itemsRes.data ?? []) as Record<string, unknown>[]).map((i) => ({
    id: String(i.id),
    name: String(i.name),
    kind: String(i.kind ?? "other"),
    unit: (i.unit as string | null) ?? null,
    base: base.get(String(i.id)) ?? null,
    packSize: i.default_unit_size != null ? Number(i.default_unit_size) : null,
    packUom: (i.default_size_uom as string | null) ?? null,
    active: i.is_active !== false,
  }));
  const pickable = allItems.filter((i) => i.active && !NON_INGREDIENT_KINDS.has(i.kind));
  const itemMap = new Map<string, ItemOption>(allItems.map((i) => [i.id, i]));
  const menuName = new Map(menu.map((m) => [m.menu_item_id, m.name]));
  const issues = buildIssues((linesRes.data ?? []).map((r) => normLine(r as Record<string, unknown>)), itemMap, menuName);

  const active = menu.filter((m) => m.is_active);
  const off = menu.filter((m) => !m.is_active);
  const margins = active.map((m) => m.margin_pct).filter((x): x is number => x != null);
  const avg = margins.length ? margins.reduce((s, x) => s + x, 0) / margins.length : null;
  const sections = [...new Set([...menu.map((m) => m.section).filter((s): s is string => !!s), ...SECTION_SUGGESTIONS])];
  const existing = Object.fromEntries(menu.map((m) => [m.name.trim().toLowerCase(), m.menu_item_id]));

  const groups = new Map<string, MenuCostRow[]>();
  for (const m of active) {
    const k = m.section?.trim() || t("no_section");
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }

  return (
    <div className="page flex flex-col gap-4 md:gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{t("title")}</h1>
          <p className="text-sm text-neutral-500">
            {menu.length
              ? `${active.length} ${t("recipes")}${avg != null ? ` · ${t("avg_margin")} ${avg.toFixed(0)}%` : ""}`
              : t("subtitle_none")}
          </p>
        </div>
      </header>

      <RecipeIntake items={pickable} sections={sections} existing={existing} />

      <CostFixes issues={issues} items={pickable} />

      {menu.length === 0 ? (
        <p className="rounded-[28px] border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">{t("empty")}</p>
      ) : null}

      {[...groups.entries()].map(([section, rows]) => (
        <section key={section} className="rounded-[28px] bg-white pb-1.5 pt-[18px] md:pt-6">
          <h2 className="px-[18px] pb-2 font-display text-lg font-semibold md:px-6">{section}</h2>
          {rows.map((m) => (
            <RecipeRow key={m.menu_item_id} m={m} locale={locale} />
          ))}
        </section>
      ))}

      {off.length ? (
        <details className="rounded-[28px] bg-white px-[18px] py-2 md:px-6">
          <summary className="min-h-11 cursor-pointer py-3 font-display text-lg font-semibold text-neutral-500">
            {t("off_menu")} · {off.length}
          </summary>
          <div className="-mx-[18px] md:-mx-6">
            {off.map((m) => (
              <RecipeRow key={m.menu_item_id} m={m} locale={locale} />
            ))}
          </div>
        </details>
      ) : null}

      {menu.length ? <p className="px-1 text-xs text-neutral-400">{t("before_vat")}</p> : null}
    </div>
  );
}

function RecipeRow({ m, locale }: { m: MenuCostRow; locale: "en" | "ar" }) {
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const missing = m.ingredient_count - m.costed_count;
  return (
    <Link
      href={`/owner/recipes/${m.menu_item_id}` as Route}
      className="flex items-center gap-3 border-t border-[#EDF0F3] px-[18px] py-3.5 transition hover:bg-neutral-50 active:bg-neutral-100 md:px-6"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold">{m.name}</span>
        <span className="text-[13px] text-neutral-500">
          {m.price != null ? aed(m.price) : "—"} · {t("cost")} {aed(m.cost)}
          {missing > 0 ? (
            <span className="text-amber-700">
              {" "}
              · {missing} {t("missing")}
            </span>
          ) : null}
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${marginTone(m.margin_pct)}`}>
        {m.margin_pct != null ? `${Math.round(m.margin_pct)}%` : "—"}
      </span>
    </Link>
  );
}
