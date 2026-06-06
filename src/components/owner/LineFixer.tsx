"use client";

import { useState, useTransition } from "react";
import { splitLineItem, type SplitPart } from "@/app/owner/items/actions";

export type FixerLine = {
  id: string;
  desc: string;
  qty: number;
  price: number;
  total: number;
  date: string;
  supplier: string;
  itemId: string | null;
  flags: string[];
};

type ItemOption = { id: string; name: string };

type Part = {
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  itemSel: string; // "" = not an item, an id, or "__new__"
  newName: string;
};

const NEW = "__new__";

function aed(n: number) {
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function LineFixer({ line, items }: { line: FixerLine; items: ItemOption[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const [parts, setParts] = useState<Part[]>([
    {
      description: line.desc,
      quantity: String(line.qty),
      unit_price: String(line.price),
      line_total: String(line.total),
      itemSel: line.itemId ?? "",
      newName: "",
    },
  ]);

  function update(i: number, patch: Partial<Part>) {
    setParts((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function addPart() {
    setParts((ps) => [
      ...ps,
      { description: "", quantity: "1", unit_price: "0", line_total: "", itemSel: "", newName: "" },
    ]);
  }
  function removePart(i: number) {
    setParts((ps) => ps.filter((_, idx) => idx !== i));
  }

  function save() {
    setError(null);
    const payload: SplitPart[] = parts.map((p) => ({
      description: p.description,
      quantity: parseFloat(p.quantity) || 0,
      unit_price: parseFloat(p.unit_price) || 0,
      line_total: p.line_total.trim() === "" ? null : parseFloat(p.line_total),
      inventory_item_id: p.itemSel && p.itemSel !== NEW ? p.itemSel : null,
      new_item_name: p.itemSel === NEW ? p.newName : null,
    }));
    if (payload.some((p) => p.new_item_name !== null && !p.new_item_name!.trim())) {
      setError("Type a name for the new item, or pick an existing one.");
      return;
    }
    startTransition(async () => {
      const r = await splitLineItem(line.id, payload);
      if (r?.error) {
        setError(r.error);
        return;
      }
      setDone(true);
      setOpen(false);
    });
  }

  if (done) {
    return (
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        Saved — <span className="italic">{line.desc}</span> updated. Refresh to see the new totals.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-neutral-700">
          <span className="font-medium">{line.desc}</span>
          {" — "}
          {line.date} — {line.qty} × {aed(line.price)} = {aed(line.total)} — {line.supplier}
          {line.flags.map((f) => (
            <span key={f} className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
              {f}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition active:scale-95"
        >
          {open ? "Close" : "Fix"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {parts.length > 1 && (
            <p className="text-[11px] text-neutral-500">
              Splitting into {parts.length} items. Set the quantity and price of each.
            </p>
          )}

          {parts.map((p, i) => (
            <div key={i} className="rounded-lg bg-neutral-50 p-2">
              {parts.length > 1 && (
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Item {i + 1}</span>
                  <button type="button" onClick={() => removePart(i)} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <Field label="Item" className="col-span-2">
                  <select value={p.itemSel} onChange={(e) => update(i, { itemSel: e.target.value })} className={inp}>
                    <option value="">— not an item —</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                    <option value={NEW}>➕ Create new item…</option>
                  </select>
                </Field>
                {p.itemSel === NEW && (
                  <Field label="New item name" className="col-span-2">
                    <input value={p.newName} onChange={(e) => update(i, { newName: e.target.value })} placeholder="e.g. Mint" className={inp} />
                  </Field>
                )}
                <Field label="Description">
                  <input value={p.description} onChange={(e) => update(i, { description: e.target.value })} className={inp} />
                </Field>
                <Field label="Qty">
                  <input value={p.quantity} onChange={(e) => update(i, { quantity: e.target.value })} type="number" step="0.001" min="0" inputMode="decimal" className={inp} />
                </Field>
                <Field label="Unit price">
                  <input value={p.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} type="number" step="0.01" min="0" inputMode="decimal" className={inp} />
                </Field>
                <Field label="Line total">
                  <input value={p.line_total} onChange={(e) => update(i, { line_total: e.target.value })} type="number" step="0.01" min="0" inputMode="decimal" placeholder="auto" className={inp} />
                </Field>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addPart}
              className="rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            >
              + Add another item (split)
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-strow-ink px-4 py-1.5 text-xs font-medium text-white transition active:scale-95 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {error && <span className="text-xs text-red-700">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const inp = "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs focus:border-strow-ink focus:outline-none";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</label>
      {children}
    </div>
  );
}
