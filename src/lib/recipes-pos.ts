/**
 * Selling prices from the POS reports, for the recipe screens.
 * The POS price of a menu item = gross ÷ qty on the latest day it sold (prices include VAT,
 * like menu_items.price). Migration 0020 fills and refreshes these automatically on every import;
 * the helpers here also let the owner use the POS price with one tap.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { N, pageAll } from "@/lib/sales";

type Db = ReturnType<typeof createServiceClient>;

export type PosPrice = { unit: number; date: string; qty: number };

/** Latest POS selling price per menu item (only items the POS has sold). */
export async function latestPosPrices(db: Db = createServiceClient(), ids?: string[]): Promise<Map<string, PosPrice>> {
  type Row = { menu_item_id: string | null; business_date: string; qty: number | string; gross: number | string };
  const rows = await pageAll<Row>((a, b) => {
    let q = db
      .from("v_pos_product_sales")
      .select("menu_item_id, business_date, qty, gross")
      .not("menu_item_id", "is", null)
      .order("business_date", { ascending: false })
      .order("id")
      .range(a, b);
    if (ids?.length) q = q.in("menu_item_id", ids);
    return q;
  }, 20_000);
  const day = new Map<string, string>();
  const sum = new Map<string, { qty: number; gross: number }>();
  for (const r of rows) {
    if (!r.menu_item_id) continue;
    const latest = day.get(r.menu_item_id);
    if (latest && latest !== r.business_date) continue; // only the newest day counts
    day.set(r.menu_item_id, r.business_date);
    const s = sum.get(r.menu_item_id) ?? { qty: 0, gross: 0 };
    s.qty += N(r.qty);
    s.gross += N(r.gross);
    sum.set(r.menu_item_id, s);
  }
  const out = new Map<string, PosPrice>();
  for (const [id, s] of sum) {
    if (s.qty > 0 && s.gross > 0) out.set(id, { unit: Math.round((s.gross / s.qty) * 100) / 100, date: day.get(id) as string, qty: s.qty });
  }
  return out;
}

/**
 * Save POS prices on menu items. Records the report date in price_pos_date when the column exists
 * (migration 0020), so newer reports keep the price current; before that, saves the price only.
 */
export async function savePosPrices(db: Db, items: { id: string; price: number; date: string }[]): Promise<{ saved: number; error?: string }> {
  let saved = 0;
  let withDate = true;
  for (const it of items) {
    let { error } = withDate
      ? await db.from("menu_items").update({ price: it.price, price_pos_date: it.date }).eq("id", it.id)
      : await db.from("menu_items").update({ price: it.price }).eq("id", it.id);
    if (error && withDate && /price_pos_date/.test(error.message)) {
      withDate = false;
      ({ error } = await db.from("menu_items").update({ price: it.price }).eq("id", it.id));
    }
    if (error) return { saved, error: error.message };
    saved++;
  }
  return { saved };
}
