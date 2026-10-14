import { createServiceClient } from "@/lib/supabase/server";
import { shortDay } from "@/lib/dates";
import { planRestock, restockText, toLevel, type RestockPlan, type StockLevel } from "@/lib/stock";

export type ItemCost = { cost: number | null; supplier: string | null };

export type Restock = {
  levels: StockLevel[];
  supplierName: Map<string, string>;
  /** Last bill price per recipe unit and who sold it last, by inventory item. */
  costs: Map<string, ItemCost>;
  plan: RestockPlan;
  /** The order list as a WhatsApp message. */
  message: string;
  /** Latest counts exist at all (else the lists were never counted). */
  counted: boolean;
};

/**
 * What to bring from the store room and what to order, from the latest counts
 * of one location. Used by the owner's Stock page, the staff order list and the
 * message staff get right after saving a count.
 */
export async function loadRestock(locationId: string, today: string): Promise<Restock> {
  const db = createServiceClient();
  const [levelsRes, suppliersRes, anyCount] = await Promise.all([
    db.from("v_stock_levels").select("*").eq("location_id", locationId).order("sort"),
    db.from("suppliers").select("id, name"),
    db.from("stock_counts").select("id").eq("location_id", locationId).limit(1),
  ]);
  if (levelsRes.error) throw new Error(levelsRes.error.message);
  const levels = ((levelsRes.data ?? []) as Record<string, unknown>[]).map(toLevel);
  const supplierName = new Map(((suppliersRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  const invIds = [...new Set(levels.map((l) => l.inventory_item_id).filter(Boolean))] as string[];
  const costs = new Map<string, ItemCost>();
  if (invIds.length) {
    const { data } = await db.from("v_item_unit_cost").select("inventory_item_id, unit_cost, supplier_name").in("inventory_item_id", invIds);
    for (const c of (data ?? []) as { inventory_item_id: string; unit_cost: number | string | null; supplier_name: string | null }[]) {
      costs.set(c.inventory_item_id, { cost: c.unit_cost === null ? null : Number(c.unit_cost), supplier: c.supplier_name });
    }
  }

  const plan = planRestock(
    levels,
    (l) => (l.supplier_id ? supplierName.get(l.supplier_id) ?? null : null) ?? (l.inventory_item_id ? costs.get(l.inventory_item_id)?.supplier ?? null : null),
    (id) => costs.get(id)?.cost ?? null,
  );
  return { levels, supplierName, costs, plan, message: restockText(plan, shortDay(today)), counted: (anyCount.data ?? []).length > 0 };
}
