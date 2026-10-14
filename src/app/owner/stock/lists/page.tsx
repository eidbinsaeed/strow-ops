import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { ListEditor, type EditItem } from "./ListEditor";

export const dynamic = "force-dynamic";

export default async function StockListsPage({ searchParams }: { searchParams: Promise<{ place?: string }> }) {
  const { place } = await searchParams;
  const ar = (await getLocale()) === "ar";
  const t = (en: string, arText: string) => (ar ? arText : en);
  const db = createServiceClient();
  const [itemsRes, suppliersRes, invRes, costRes] = await Promise.all([
    db
      .from("stock_items")
      .select("id, place, name, unit_label, step, min_qty, reorder_qty, grp, sort, supplier_id, inventory_item_id, base_per_unit")
      .eq("is_active", true)
      .order("sort"),
    db.from("suppliers").select("id, name").order("name"),
    db.from("inventory_items").select("id, name, base_uom").eq("is_active", true).order("name"),
    // Bill prices are per kg / L / pc; use that unit where the item has none of its own.
    db.from("v_item_unit_cost").select("inventory_item_id, base_uom"),
  ]);
  const costUom = new Map(((costRes.data ?? []) as { inventory_item_id: string; base_uom: string | null }[]).map((c) => [c.inventory_item_id, c.base_uom]));
  const inventory = ((invRes.data ?? []) as { id: string; name: string; base_uom: string | null }[]).map((i) => ({
    ...i,
    base_uom: i.base_uom ?? costUom.get(i.id) ?? null,
  }));

  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const items: EditItem[] = ((itemsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    place: r.place === "store" ? "store" : "shop",
    name: String(r.name),
    unit_label: String(r.unit_label),
    step: Number(r.step) || 1,
    min_qty: num(r.min_qty),
    reorder_qty: num(r.reorder_qty),
    grp: String(r.grp),
    sort: Number(r.sort) || 0,
    supplier_id: (r.supplier_id as string | null) ?? null,
    inventory_item_id: (r.inventory_item_id as string | null) ?? null,
    base_per_unit: num(r.base_per_unit),
  }));

  return (
    <div className="page flex flex-col gap-4 md:gap-5">
      <header className="px-1">
        <Link href="/owner/stock" className="text-[13px] font-semibold text-strow-blue">
          {t("← Stock", "→ المخزون")}
        </Link>
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{t("Count lists", "قوائم العدّ")}</h1>
        <p className="text-sm text-neutral-500">
          {t(
            "What staff count, in what unit, and the minimum. Below the minimum, an item is brought from the store room or goes on the order list with the usual order.",
            "ما يعدّه الموظفون وبأي وحدة والحد الأدنى. تحت الحد الأدنى يُنقل الصنف من المخزن أو يدخل قائمة الطلب بالكمية المعتادة.",
          )}
        </p>
      </header>
      {itemsRes.error ? (
        <p className="rounded-[28px] bg-[#FBE9E7] px-[18px] py-5 text-sm text-[#9A1B12]">{itemsRes.error.message}</p>
      ) : (
        <ListEditor
          ar={ar}
          initialPlace={place === "store" ? "store" : "shop"}
          items={items}
          suppliers={(suppliersRes.data ?? []) as { id: string; name: string }[]}
          inventory={inventory}
        />
      )}
    </div>
  );
}
