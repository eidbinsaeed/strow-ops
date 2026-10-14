"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { removeStockItem, saveStockItem } from "../actions";
import { fmtQty, groupItems, type Place } from "@/lib/stock";

export type EditItem = {
  id: string;
  place: Place;
  name: string;
  unit_label: string;
  step: number;
  min_qty: number | null;
  reorder_qty: number | null;
  grp: string;
  sort: number;
  supplier_id: string | null;
  inventory_item_id: string | null;
  base_per_unit: number | null;
};

type Inv = { id: string; name: string; base_uom: string | null };
type Draft = Record<"name" | "unit_label" | "step" | "min_qty" | "reorder_qty" | "grp" | "supplier_id" | "inventory_item_id" | "base_per_unit", string>;

const toDraft = (i: EditItem | null, grp: string): Draft => ({
  name: i?.name ?? "",
  unit_label: i?.unit_label ?? "pieces",
  step: i ? fmtQty(i.step) : "1",
  min_qty: i?.min_qty !== null && i?.min_qty !== undefined ? fmtQty(i.min_qty) : "",
  reorder_qty: i?.reorder_qty !== null && i?.reorder_qty !== undefined ? fmtQty(i.reorder_qty) : "",
  grp: i?.grp ?? grp,
  supplier_id: i?.supplier_id ?? "",
  inventory_item_id: i?.inventory_item_id ?? "",
  base_per_unit: i?.base_per_unit !== null && i?.base_per_unit !== undefined ? fmtQty(i.base_per_unit) : "",
});

const INPUT = "h-11 w-full rounded-xl border border-neutral-300 bg-[#F7F8FA] px-3 text-[15px] text-strow-ink";
const LABEL = "flex flex-col gap-1 text-xs font-semibold text-neutral-500";

export function ListEditor({
  ar,
  initialPlace,
  items,
  suppliers,
  inventory,
}: {
  ar: boolean;
  initialPlace: Place;
  items: EditItem[];
  suppliers: { id: string; name: string }[];
  inventory: Inv[];
}) {
  const t = (en: string, arText: string) => (ar ? arText : en);
  const router = useRouter();
  const [place, setPlace] = useState<Place>(initialPlace);
  const [open, setOpen] = useState<string | null>(null); // item id, or "new"
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = items.filter((i) => i.place === place);
  const groups = useMemo(() => groupItems(list), [list]);
  const groupNames = [...new Set(list.map((i) => i.grp))];
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const invById = new Map(inventory.map((i) => [i.id, i]));

  function start(id: string | null) {
    const item = id ? items.find((i) => i.id === id) ?? null : null;
    setOpen(id ?? "new");
    setDraft(toDraft(item, groupNames[groupNames.length - 1] ?? "Other"));
    setErr(null);
  }
  function close() {
    setOpen(null);
    setDraft(null);
    setErr(null);
  }
  const set = (k: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  async function save(id: string | null) {
    if (!draft) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await saveStockItem({
        id,
        place,
        name: draft.name,
        unit_label: draft.unit_label,
        step: n(draft.step),
        min_qty: n(draft.min_qty),
        reorder_qty: n(draft.reorder_qty),
        grp: draft.grp,
        supplier_id: draft.supplier_id || null,
        inventory_item_id: draft.inventory_item_id || null,
        base_per_unit: n(draft.base_per_unit),
      });
      if ("error" in r) return setErr(r.error);
      close();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(t(`Take "${name}" off the list? Past counts stay.`, `إزالة "${name}" من القائمة؟ تبقى عمليات العدّ السابقة.`))) return;
    setBusy(true);
    try {
      const r = await removeStockItem(id);
      if ("error" in r) return setErr(r.error);
      close();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const form = (id: string | null) => {
    if (!draft) return null;
    const inv = draft.inventory_item_id ? invById.get(draft.inventory_item_id) : null;
    return (
      <div className="flex flex-col gap-3 border-t border-[#EEF1F4] bg-[#FAFBFC] px-4 py-4">
        <label className={LABEL}>
          {t("Name", "الاسم")}
          <input className={INPUT} value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} autoFocus={!id} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>
            {t("Counted in", "وحدة العدّ")}
            <input className={INPUT} value={draft.unit_label} maxLength={40} placeholder="bottles, kg, boxes of 12" onChange={(e) => set("unit_label", e.target.value)} />
          </label>
          <label className={LABEL}>
            {t("+ / − step", "خطوة + / −")}
            <input className={INPUT} inputMode="decimal" value={draft.step} onChange={(e) => set("step", e.target.value)} />
          </label>
          <label className={LABEL}>
            {t("Minimum", "الحد الأدنى")}
            <input className={INPUT} inputMode="decimal" value={draft.min_qty} placeholder={t("none", "لا يوجد")} onChange={(e) => set("min_qty", e.target.value)} />
          </label>
          <label className={LABEL}>
            {t("Usual order", "الطلب المعتاد")}
            <input className={INPUT} inputMode="decimal" value={draft.reorder_qty} placeholder={t("2 × minimum", "ضعف الحد الأدنى")} onChange={(e) => set("reorder_qty", e.target.value)} />
          </label>
        </div>
        <label className={LABEL}>
          {t("Heading", "العنوان")}
          <input className={INPUT} list={`groups-${place}`} value={draft.grp} maxLength={40} onChange={(e) => set("grp", e.target.value)} />
          <datalist id={`groups-${place}`}>
            {groupNames.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <label className={LABEL}>
          {t("Usual supplier", "المورد المعتاد")}
          <select className={INPUT} value={draft.supplier_id} onChange={(e) => set("supplier_id", e.target.value)}>
            <option value="">{t("— whoever sold it last —", "— آخر من باعه —")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          {t("Item in bills and recipes (for prices and days left)", "الصنف في الفواتير والوصفات (للأسعار والأيام المتبقية)")}
          <select className={INPUT} value={draft.inventory_item_id} onChange={(e) => set("inventory_item_id", e.target.value)}>
            <option value="">{t("— not linked —", "— غير مرتبط —")}</option>
            {inventory.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        {draft.inventory_item_id ? (
          <label className={LABEL}>
            {t(
              `How many ${inv?.base_uom ?? "recipe units"} in one ${draft.unit_label ? draft.unit_label.replace(/s$/, "") : "unit"}? (for prices and days left)`,
              `كم ${inv?.base_uom ?? "وحدة"} في الوحدة الواحدة؟ (للأسعار والأيام المتبقية)`,
            )}
            <input className={INPUT} inputMode="decimal" value={draft.base_per_unit} placeholder="e.g. 2 for a 2 L bottle" onChange={(e) => set("base_per_unit", e.target.value)} />
          </label>
        ) : null}
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => save(id)} className="min-h-11 rounded-xl bg-strow-blue px-5 text-[15px] font-semibold text-white disabled:opacity-60">
            {busy ? t("Saving…", "جارٍ الحفظ…") : id ? t("Save", "حفظ") : t("Add to list", "إضافة")}
          </button>
          <button type="button" disabled={busy} onClick={close} className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-[15px] font-semibold text-strow-ink">
            {t("Cancel", "إلغاء")}
          </button>
          {id ? (
            <button type="button" disabled={busy} onClick={() => remove(id, draft.name)} className="ms-auto min-h-11 rounded-xl px-3 text-[14px] font-semibold text-[#9A1B12]">
              {t("Remove from list", "إزالة من القائمة")}
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex gap-2" role="tablist">
        {(["shop", "store"] as Place[]).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={place === p}
            onClick={() => {
              setPlace(p);
              close();
            }}
            className={`min-h-11 whitespace-nowrap rounded-full px-5 text-[15px] font-semibold ${place === p ? "bg-strow-ink text-white" : "bg-white text-strow-ink"}`}
          >
            {p === "shop" ? t("Shop", "المحل") : t("Store room", "المخزن")} <span className="opacity-60">{items.filter((i) => i.place === p).length}</span>
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <section key={g.name} className="flex flex-col gap-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{g.name}</h2>
          <div className="overflow-hidden rounded-[24px] bg-white">
            {g.items.map((i, idx) => {
              const sup = i.supplier_id ? supplierName.get(i.supplier_id) : null;
              const link = i.inventory_item_id ? invById.get(i.inventory_item_id) : null;
              return (
                <div key={i.id} className={idx ? "border-t border-[#EEF1F4]" : ""}>
                  <button
                    type="button"
                    onClick={() => (open === i.id ? close() : start(i.id))}
                    aria-expanded={open === i.id}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-strow-ink">{i.name}</span>
                      <span className="block text-xs text-neutral-500">
                        {i.unit_label} · {t("min", "الحد الأدنى")} {i.min_qty !== null ? fmtQty(i.min_qty) : "—"}
                        {i.reorder_qty !== null ? ` · ${t("order", "الطلب")} ${fmtQty(i.reorder_qty)}` : ""}
                        {sup ? ` · ${sup}` : ""}
                        {link && i.base_per_unit ? ` · ${fmtQty(i.base_per_unit)} ${link.base_uom ?? t("units", "وحدة")} ${t("each", "لكل وحدة")}` : ""}
                      </span>
                    </span>
                    <span className="text-neutral-400" aria-hidden="true">
                      {open === i.id ? "▾" : "›"}
                    </span>
                  </button>
                  {open === i.id ? form(i.id) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="overflow-hidden rounded-[24px] bg-white">
        {open === "new" ? (
          <>
            <p className="px-4 pt-4 text-[15px] font-semibold">{place === "shop" ? t("New shop item", "صنف جديد للمحل") : t("New store-room item", "صنف جديد للمخزن")}</p>
            {form(null)}
          </>
        ) : (
          <button type="button" onClick={() => start(null)} className="flex min-h-14 w-full items-center justify-center text-[15px] font-semibold text-strow-blue">
            + {t("Add an item", "إضافة صنف")}
          </button>
        )}
      </div>
    </>
  );
}
