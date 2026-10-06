"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/owner/LocaleProvider";
import { PhotoViewer } from "@/components/ai/PhotoViewer";
import { ItemSelect } from "./RecipeIntake";
import { addRecipeLine, deleteMenuItem, deleteRecipeLine, updateMenuItem, updateRecipeLine } from "./actions";
import { RECIPE_UOMS, aed, fmtNum, recipeUomFor, rt, type ItemOption, type LineCostRow, type RecipeUom } from "@/lib/recipes";

const field = "rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-[15px] focus:border-strow-ink focus:outline-none";
const dark = "rounded-full bg-strow-ink px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50";

type Res = { ok?: boolean; error?: string };

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Res>, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else after?.();
    });
  };
  return { error, pending, run };
}

export function RecipePhoto({ fileId, name }: { fileId: string; name: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const src = `/api/bill-photo/${fileId}`;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-strow-blue">
        🖼 {rt("view_photo", locale)}
      </button>
      {open ? <PhotoViewer src={src} caption={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function DetailsEditor({
  item,
  sections,
}: {
  item: { id: string; name: string; section: string | null; price: number | null; method: string | null; is_active: boolean };
  sections: string[];
}) {
  const locale = useLocale();
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const router = useRouter();
  const { error, pending, run } = useAction();
  return (
    <details className="rounded-[28px] bg-white px-[18px] py-2 md:px-[22px]">
      <summary className="min-h-11 cursor-pointer py-3 font-display text-lg font-semibold">{t("details")}</summary>
      <form action={(fd) => run(() => updateMenuItem(fd))} className="flex flex-col gap-2.5 pb-4">
        <input type="hidden" name="id" value={item.id} />
        <label className="text-xs text-neutral-500">
          {t("name")}
          <input name="name" defaultValue={item.name} required dir="auto" className={`${field} mt-1 w-full`} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-neutral-500">
            {t("section")}
            <input name="section" list="detail-sections" defaultValue={item.section ?? ""} className={`${field} mt-1 w-full`} />
            <datalist id="detail-sections">
              {sections.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="text-xs text-neutral-500">
            {t("price")}
            <input name="price" inputMode="decimal" defaultValue={item.price ?? ""} placeholder="AED" className={`${field} mt-1 w-full`} />
          </label>
        </div>
        <label className="text-xs text-neutral-500">
          {t("method")}
          <textarea name="method" rows={4} defaultValue={item.method ?? ""} dir="auto" className={`${field} mt-1 w-full`} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={item.is_active} />
          {t("on_menu")}
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("confirm_delete"))) return;
              run(() => deleteMenuItem(item.id), () => router.push("/owner/recipes"));
            }}
            className="rounded-full border border-red-200 px-4 py-2.5 text-sm text-red-600 disabled:opacity-50"
          >
            {t("delete_recipe")}
          </button>
          <button disabled={pending} className={dark}>
            {pending ? t("saving") : t("set")}
          </button>
        </div>
      </form>
    </details>
  );
}

export function LineRow({ line, items }: { line: LineCostRow; items: ItemOption[] }) {
  const locale = useLocale();
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const [editing, setEditing] = useState(false);
  const [itemId, setItemId] = useState(line.inventory_item_id ?? "");
  const { error, pending, run } = useAction();

  const change =
    line.cost_source === "purchase" && line.prev_unit_cost && line.purchase_unit_cost && line.prev_unit_cost > 0
      ? (line.purchase_unit_cost - line.prev_unit_cost) / line.prev_unit_cost
      : 0;
  const source =
    line.cost_source === "purchase"
      ? `${aed(line.purchase_unit_cost)}/${line.cost_uom}${line.supplier_name ? ` · ${line.supplier_name}` : ""}${line.last_bought ? ` · ${new Date(line.last_bought).toLocaleDateString("en-AE", { day: "numeric", month: "short" })}` : ""}`
      : line.cost_source === "manual"
        ? Number(line.manual_unit_cost) === 0
          ? t("free")
          : `${aed(line.manual_unit_cost)}/${line.base_uom} · ${t("manual_price")}`
        : null;

  if (editing) {
    return (
      <form
        action={(fd) => run(() => updateRecipeLine(fd), () => setEditing(false))}
        className="flex flex-col gap-2 border-t border-[#EDF0F3] py-3"
      >
        <input type="hidden" name="id" value={line.id} />
        <input type="hidden" name="inventory_item_id" value={itemId || "none"} />
        <ItemSelect items={items} value={itemId} onChange={setItemId} className={`${field} w-full`} />
        {!itemId ? <input name="label" defaultValue={line.label ?? line.ingredient} placeholder={t("label_ph")} dir="auto" className={`${field} w-full`} /> : null}
        <div className="flex items-center gap-2">
          <input name="qty" inputMode="decimal" defaultValue={fmtNum(line.qty)} required className={`${field} w-24`} />
          <select name="uom" defaultValue={line.uom} className={`${field} w-20`}>
            {RECIPE_UOMS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setEditing(false)} className="ms-auto rounded-full px-3 py-2 text-sm text-neutral-500">
            {t("cancel")}
          </button>
          <button disabled={pending} className={dark}>
            {t("set")}
          </button>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </form>
    );
  }

  return (
    <div className="border-t border-[#EDF0F3] py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-snug">{line.ingredient}</p>
          <p className="text-sm text-neutral-600">
            {fmtNum(line.qty)} {line.uom}
            {line.as_written ? <span className="text-neutral-400"> · “{line.as_written}”</span> : null}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className={`text-[15px] font-semibold tabular-nums ${line.line_cost == null ? "text-amber-700" : ""}`}>
            {line.line_cost == null ? t("missing") : aed(line.line_cost)}
          </p>
        </div>
      </div>
      {source ? (
        <p className="mt-0.5 text-xs text-neutral-500">
          {source}
          {Math.abs(change) >= 0.02 ? (
            <span className={change > 0 ? "text-red-600" : "text-emerald-700"}>
              {" "}
              · {change > 0 ? "▲" : "▼"} {Math.round(Math.abs(change) * 100)}% {t("vs_before")}
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="mt-1 flex gap-4">
        <button type="button" onClick={() => setEditing(true)} className="min-h-9 text-sm text-strow-blue">
          {t("edit")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t("confirm_remove_line"))) return;
            run(() => deleteRecipeLine(line.id));
          }}
          className="min-h-9 text-sm text-red-600 disabled:opacity-50"
        >
          {t("remove")}
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function AddLineForm({ menuItemId, items }: { menuItemId: string; items: ItemOption[] }) {
  const locale = useLocale();
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const [itemId, setItemId] = useState("");
  const [uom, setUom] = useState<RecipeUom>("g");
  const [key, setKey] = useState(0);
  const { error, pending, run } = useAction();
  return (
    <form
      key={key}
      action={(fd) =>
        run(() => addRecipeLine(fd), () => {
          setItemId("");
          setKey((k) => k + 1);
        })
      }
      className="flex flex-col gap-2 border-t border-[#EDF0F3] pt-3"
    >
      <input type="hidden" name="menu_item_id" value={menuItemId} />
      <input type="hidden" name="inventory_item_id" value={itemId} />
      <ItemSelect
        items={items}
        value={itemId}
        onChange={(v) => {
          setItemId(v);
          const it = items.find((i) => i.id === v);
          if (it?.base) setUom(recipeUomFor(it.base));
        }}
        className={`${field} w-full`}
      />
      {!itemId ? <input name="label" placeholder={t("label_ph")} dir="auto" className={`${field} w-full`} /> : null}
      <div className="flex items-center gap-2">
        <input name="qty" inputMode="decimal" required placeholder={t("qty")} className={`${field} w-24`} />
        <select name="uom" value={uom} onChange={(e) => setUom(e.target.value as RecipeUom)} className={`${field} w-20`}>
          {RECIPE_UOMS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        {!itemId ? (
          <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-neutral-600">
            <input type="checkbox" name="free" />
            <span className="truncate">{t("free")}</span>
          </label>
        ) : (
          <span className="flex-1" />
        )}
        <button disabled={pending} className={dark}>
          {t("add")}
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
