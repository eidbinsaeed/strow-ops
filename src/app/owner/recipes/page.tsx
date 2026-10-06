import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { hrefWith, type SearchParams } from "@/lib/period";
import { RecipeIntake } from "./RecipeIntake";
import { CostFixes } from "./RecipeFixes";
import { RecipesSalesTab } from "./SalesTab";
import { FillPosPrices } from "./PosPrice";
import { latestPosPrices, type PosPrice } from "@/lib/recipes-pos";
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

/** Sections in menu order; anything else follows alphabetically, "Other" last. */
const SECTION_ORDER = ["Hot coffee", "Iced coffee", "V60", "Matcha", "Tea", "Hot drinks", "Cold drinks", "Smoothies", "Bowls", "Desserts", "Bakery", "Bakery & breakfast", "Water & soft drinks"];
const SECTION_AR: Record<string, string> = {
  "Hot coffee": "قهوة ساخنة",
  "Iced coffee": "قهوة باردة",
  V60: "V60",
  "Hot drinks": "مشروبات ساخنة",
  "Cold drinks": "مشروبات باردة",
  Smoothies: "سموذي",
  Desserts: "حلويات",
  "Bakery & breakfast": "مخبوزات وفطور",
  "Water & soft drinks": "مياه ومشروبات غازية",
  Other: "أخرى",
};

type Extra = { source: string; price_pos_date: string | null; pos_name: string | null };

export default async function RecipesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const ar = locale === "ar";
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const db = createServiceClient();
  const tab = sp.tab === "cards" ? "cards" : "sales";

  const [menuRes, linesRes, itemsRes, unitRes, extraRes] = await Promise.all([
    db.from("v_menu_item_costs").select("*").order("name"),
    db.from("v_recipe_line_costs").select("*").is("line_cost", null),
    db.from("inventory_items").select("id, name, kind, unit, default_unit_size, default_size_uom, is_active").order("name"),
    db.from("v_item_unit_cost").select("inventory_item_id, base_uom"),
    db.from("menu_items").select("id, source, price_pos_date, pos_name"),
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

  // price_pos_date arrives with migration 0020; before it, read the rest.
  let extraRows = (extraRes.data ?? []) as (Extra & { id: string })[];
  if (extraRes.error) {
    const { data } = await db.from("menu_items").select("id, source, pos_name");
    extraRows = ((data ?? []) as { id: string; source: string; pos_name: string | null }[]).map((r) => ({ ...r, price_pos_date: null }));
  }
  const extra = new Map(extraRows.map((r) => [r.id, r]));

  const menu = (menuRes.data ?? []).map((r) => normMenu(r as Record<string, unknown>));
  const active = menu.filter((m) => m.is_active);
  const margins = active.map((m) => m.margin_pct).filter((x): x is number => x != null);
  const avg = margins.length ? margins.reduce((s, x) => s + x, 0) / margins.length : null;
  const withLines = active.filter((m) => m.ingredient_count > 0).length;
  const countText =
    withLines === active.length
      ? `${active.length} ${t("recipes")}`
      : ar
        ? `${active.length} صنفاً · ${withLines} لها وصفة`
        : `${active.length} items · ${withLines} with a recipe`;

  const tabs = (
    <div role="group" aria-label={ar ? "عرض الوصفات" : "Recipes view"} className="inline-flex gap-1 rounded-full bg-white/70 p-1">
      {(
        [
          ["sales", ar ? "المبيعات" : "Sales"],
          ["cards", ar ? "بطاقات التكلفة" : "Cost cards"],
        ] as const
      ).map(([k, label]) => (
        <Link
          key={k}
          href={(k === "sales" ? hrefWith("/owner/recipes", sp, { tab: null }) : "/owner/recipes?tab=cards") as Route}
          aria-current={tab === k ? "true" : undefined}
          className={`flex min-h-10 items-center rounded-full px-4 text-sm transition ${tab === k ? "bg-strow-ink font-semibold text-white" : "text-neutral-600 hover:text-strow-ink"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3 px-1">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold tracking-[0.08em] text-neutral-500">{ar ? "القائمة" : "MENU"}</span>
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{t("title")}</h1>
        <p className="text-sm text-neutral-500">
          {menu.length
            ? tab === "sales"
              ? ar
                ? `${countText} · ما باعه كل صنف وكلّفه وربحه`
                : `${countText} · what each item sold, cost and earned`
              : `${countText}${avg != null ? ` · ${t("avg_margin")} ${avg.toFixed(0)}%` : ""}`
            : t("subtitle_none")}
        </p>
      </div>
      {tabs}
    </header>
  );

  if (tab === "sales") {
    return (
      <div className="page flex flex-col gap-4 md:gap-5">
        {header}
        <RecipesSalesTab
          sp={sp}
          locale={locale}
          menu={menu.map((m) => ({ id: m.menu_item_id, name: m.name, is_active: m.is_active, source: extra.get(m.menu_item_id)?.source ?? "manual" }))}
        />
      </div>
    );
  }

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

  const off = menu.filter((m) => !m.is_active);
  const sections = [...new Set([...menu.map((m) => m.section).filter((s): s is string => !!s), ...SECTION_SUGGESTIONS])];
  const existing = Object.fromEntries(menu.map((m) => [m.name.trim().toLowerCase(), m.menu_item_id]));

  const groups = new Map<string, MenuCostRow[]>();
  for (const m of active) {
    const k = m.section?.trim() || "Other";
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const rank = (s: string) => {
    const i = SECTION_ORDER.indexOf(s);
    return i >= 0 ? i : s === "Other" ? 1000 : 500;
  };
  const ordered = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));

  const pos: Map<string, PosPrice> = await latestPosPrices(db).catch(() => new Map<string, PosPrice>());
  const posPrices = active.filter((m) => extra.get(m.menu_item_id)?.price_pos_date).length;
  const noPrice = active.filter((m) => m.price == null).length;
  const fillable = active.filter((m) => m.price == null && pos.has(m.menu_item_id)).length;
  const noRecipe = active.filter((m) => m.ingredient_count === 0).length;
  const autoAdded = active.filter((m) => extra.get(m.menu_item_id)?.source === "pos" && m.ingredient_count === 0).length;

  return (
    <div className="page flex flex-col gap-4 md:gap-5">
      {header}

      {posPrices || noPrice || autoAdded ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[20px] bg-[#E3EAFB] px-4 py-3 text-sm leading-relaxed text-[#1A3FA8]">
          <span className="min-w-0 flex-[1_1_320px]">
            {[
              posPrices
                ? ar
                  ? `${posPrices} ${posPrices === 1 ? "سعر" : "أسعار"} من نقاط البيع (عليها POS).`
                  : `${posPrices} ${posPrices === 1 ? "price" : "prices"} filled from the POS (marked POS).`
                : null,
              autoAdded
                ? ar
                  ? `${autoAdded} ${autoAdded === 1 ? "صنف أضيف" : "أصناف أضيفت"} تلقائياً من تقارير نقاط البيع وتحتاج وصفة.`
                  : `${autoAdded} ${autoAdded === 1 ? "item was" : "items were"} added automatically from the POS reports and ${autoAdded === 1 ? "needs a recipe" : "need recipes"}.`
                : null,
              noPrice ? priceNote(noPrice, fillable, ar) : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </span>
          {fillable ? <FillPosPrices count={fillable} locale={locale} /> : null}
        </div>
      ) : null}

      <RecipeIntake items={pickable} sections={sections} existing={existing} />

      <CostFixes issues={issues} items={pickable} />

      {menu.length === 0 ? (
        <p className="rounded-[28px] border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">{t("empty")}</p>
      ) : null}

      {ordered.map(([section, rows]) => (
        <section key={section} className="rounded-[28px] bg-white pb-1.5 pt-[18px] md:pt-6">
          <h2 className="flex items-baseline justify-between gap-2 px-[18px] pb-2 md:px-6">
            <span className="font-display text-lg font-semibold">{ar ? (SECTION_AR[section] ?? section) : section}</span>
            <span className="text-xs text-neutral-400">{rows.length}</span>
          </h2>
          {rows.map((m) => (
            <RecipeRow key={m.menu_item_id} m={m} locale={locale} extra={extra.get(m.menu_item_id)} pos={pos.get(m.menu_item_id)} />
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
              <RecipeRow key={m.menu_item_id} m={m} locale={locale} extra={extra.get(m.menu_item_id)} pos={pos.get(m.menu_item_id)} />
            ))}
          </div>
        </details>
      ) : null}

      {menu.length ? (
        <p className="px-1 text-xs text-neutral-400">
          {t("before_vat")}
          {noRecipe ? (ar ? ` · ${noRecipe} بدون وصفة بعد.` : ` · ${noRecipe} without a recipe yet.`) : ""}
        </p>
      ) : null}
    </div>
  );
}

function RecipeRow({ m, locale, extra, pos }: { m: MenuCostRow; locale: "en" | "ar"; extra?: Extra; pos?: PosPrice }) {
  const ar = locale === "ar";
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const missing = m.ingredient_count - m.costed_count;
  const noRecipe = m.ingredient_count === 0;
  return (
    <Link
      href={`/owner/recipes/${m.menu_item_id}` as Route}
      className="flex items-center gap-3 border-t border-[#EDF0F3] px-[18px] py-3.5 transition hover:bg-neutral-50 active:bg-neutral-100 md:px-6"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold">{m.name}</span>
        <span className="text-[13px] text-neutral-500">
          {m.price != null ? (
            aed(m.price)
          ) : pos ? (
            <span className="text-[#1A3FA8]">{ar ? `بدون سعر · نقاط البيع ${aed(pos.unit)}` : `No price · POS ${aed(pos.unit)}`}</span>
          ) : ar ? (
            "بدون سعر بعد"
          ) : (
            "No price yet"
          )}
          {noRecipe ? (
            <span className="text-[#1A3FA8]">
              {" "}
              · {extra?.source === "pos" ? (ar ? "أضيف من نقاط البيع، بدون وصفة بعد" : "added from the POS, no recipe yet") : ar ? "بدون وصفة بعد" : "no recipe yet"}
            </span>
          ) : (
            <>
              {" "}
              · {t("cost")} {aed(m.cost)}
            </>
          )}
          {missing > 0 ? (
            <span className="text-amber-700">
              {" "}
              · {missing} {t("missing")}
            </span>
          ) : null}
        </span>
      </span>
      {extra?.price_pos_date ? (
        <span title={ar ? "السعر من تقرير نقاط البيع" : "Price from the POS report"} className="shrink-0 rounded-full bg-[#E3EAFB] px-2 py-0.5 text-[11px] font-bold text-[#1A3FA8]">
          POS
        </span>
      ) : null}
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${marginTone(m.margin_pct)}`}>
        {m.margin_pct != null ? `${Math.round(m.margin_pct)}%` : "—"}
      </span>
    </Link>
  );
}

/** "N still have no price…" with what the POS can fill now and what fills later. */
function priceNote(noPrice: number, fillable: number, ar: boolean): string {
  const rest = noPrice - fillable;
  if (ar) {
    const head = `${noPrice} بدون سعر بعد`;
    if (fillable && rest) return `${head}؛ نقاط البيع باعت ${fillable} منها. الباقي يأخذ سعره أول مرة يظهر في تقرير نقاط البيع (أو ارفع تقارير الأيام القديمة).`;
    if (fillable) return `${head}، ونقاط البيع باعتها كلها.`;
    return `${head}؛ كل صنف يأخذ سعره أول مرة يظهر في تقرير نقاط البيع (أو ارفع تقارير الأيام القديمة).`;
  }
  const head = `${noPrice} still ${noPrice === 1 ? "has" : "have"} no price`;
  if (fillable && rest) return `${head}; the POS has sold ${fillable} of them. The rest get a price the first time they show up in a POS report (or upload old days' reports).`;
  if (fillable) return `${head}, and the POS has sold ${noPrice === 1 ? "it" : "all of them"}.`;
  return `${head}; each gets one the first time it shows up in a POS report (or upload old days' reports).`;
}
