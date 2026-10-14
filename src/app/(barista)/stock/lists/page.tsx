import Link from "next/link";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { staffCanEditLists } from "@/lib/stock-items";
import { ListEditor, type EditItem } from "@/components/stock/ListEditor";
import { removeStockItemAsStaff, saveStockItemAsStaff } from "../actions";

export const dynamic = "force-dynamic";

/** The count lists, editable by staff the owner has allowed (baristas.can_edit_stock_lists). */
export default async function StaffStockListsPage({ searchParams }: { searchParams: Promise<{ place?: string }> }) {
  const session = await getBaristaSession();
  if (!session) redirect("/login");
  const { place } = await searchParams;

  const header = (
    <header className="flex items-center gap-3">
      <Link href="/home" aria-label="Back to home" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-300 bg-white text-strow-ink">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Items, units and minimums</p>
        <h1 className="font-display text-2xl font-bold">Count lists</h1>
      </div>
    </header>
  );

  if (!(await staffCanEditLists(session.bid))) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
        {header}
        <p className="rounded-2xl bg-white p-4 text-sm text-neutral-600">The owner has not allowed you to edit the count lists. Ask the owner if something on the list is wrong.</p>
      </main>
    );
  }

  const db = createServiceClient();
  const [itemsRes, suppliersRes, invRes, costRes] = await Promise.all([
    db
      .from("stock_items")
      .select("id, place, name, unit_label, step, min_qty, reorder_qty, grp, sort, supplier_id, inventory_item_id, base_per_unit, source")
      .eq("location_id", session.lid)
      .eq("is_active", true)
      .order("sort"),
    db.from("suppliers").select("id, name").order("name"),
    db.from("inventory_items").select("id, name, base_uom").eq("location_id", session.lid).eq("is_active", true).order("name"),
    db.from("v_item_unit_cost").select("inventory_item_id, base_uom"),
  ]);
  const costUom = new Map(((costRes.data ?? []) as { inventory_item_id: string; base_uom: string | null }[]).map((c) => [c.inventory_item_id, c.base_uom]));
  const inventory = ((invRes.data ?? []) as { id: string; name: string; base_uom: string | null }[]).map((i) => ({ ...i, base_uom: i.base_uom ?? costUom.get(i.id) ?? null }));
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
    source: String(r.source ?? "manual"),
  }));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
      {header}
      <p className="rounded-2xl bg-white p-4 text-sm text-neutral-600">
        Below its minimum, an item is brought from the store room or goes on the order list with the usual order. Every item on a scanned bill lands here by itself under “New from bills”. The owner sees every change you make.
      </p>
      {itemsRes.error ? (
        <p className="rounded-2xl bg-[#FBE9E7] p-4 text-sm text-[#9A1B12]">{itemsRes.error.message}</p>
      ) : (
        <ListEditor
          ar={false}
          initialPlace={place === "store" ? "store" : "shop"}
          items={items}
          suppliers={(suppliersRes.data ?? []) as { id: string; name: string }[]}
          inventory={inventory}
          save={saveStockItemAsStaff}
          remove={removeStockItemAsStaff}
        />
      )}
    </main>
  );
}
