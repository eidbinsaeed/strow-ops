import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { todayDubai } from "@/lib/dates";
import { StockView, type PlaceCount } from "@/components/apple/StockView";

export const dynamic = "force-dynamic";

type Level = { place: string; counted_on: string | null; is_low: boolean | null };

export default async function StockHubPage() {
  const locale = await getLocale();
  const db = createServiceClient();
  const [levels, menu, recipeLines, items] = await Promise.all([
    db.from("v_stock_levels").select("place, counted_on, is_low").range(0, 1999),
    db.from("menu_items").select("id").eq("is_active", true).range(0, 1999),
    db.from("recipe_lines").select("menu_item_id").range(0, 9999),
    db.from("inventory_items").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  const rows = (levels.data ?? []) as Level[];
  const place = (p: string): PlaceCount => {
    const list = rows.filter((r) => r.place === p);
    const last = list.reduce<string | null>((a, r) => (r.counted_on && (!a || r.counted_on > a) ? r.counted_on : a), null);
    return { last, low: list.filter((r) => r.is_low).length, items: list.length };
  };
  const withRecipe = new Set(((recipeLines.data ?? []) as { menu_item_id: string }[]).map((r) => r.menu_item_id));
  const menuIds = ((menu.data ?? []) as { id: string }[]).map((r) => r.id);
  return (
    <StockView
      locale={locale}
      s={{
        shop: place("shop"),
        store: place("store"),
        listItems: rows.length,
        recipes: menuIds.length,
        noRecipe: menuIds.filter((id) => !withRecipe.has(id)).length,
        items: items.count ?? 0,
        today: todayDubai(),
      }}
    />
  );
}
