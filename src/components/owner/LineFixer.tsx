"use client";

import { useState, useTransition } from "react";
import { updateLineItem } from "@/app/owner/items/actions";

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

function aed(n: number) {
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function LineFixer({ line, items }: { line: FixerLine; items: ItemOption[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const [qty, setQty] = useState(String(line.qty));
  const [price, setPrice] = useState(String(line.price));
  const [total, setTotal] = useState(String(line.total));
  const [itemId, setItemId] = useState(line.itemId ?? "");

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("line_id", line.id);
    fd.set("quantity", qty);
    fd.set("unit_price", price);
    fd.set("line_total", total);
    fd.set("inventory_item_id", itemId);
    startTransition(async () => {
      const r = await updateLineItem(fd);
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
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Field label="Quantity">
            <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" step="0.001" min="0" inputMode="decimal" className={inp} />
          </Field>
          <Field label="Unit price">
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.01" min="0" inputMode="decimal" className={inp} />
          </Field>
          <Field label="Line total">
            <input value={total} onChange={(e) => setTotal(e.target.value)} type="number" step="0.01" min="0" inputMode="decimal" className={inp} />
          </Field>
          <Field label="Item">
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inp}>
              <option value="">— not an item —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>{it.name}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="w-full rounded-lg bg-strow-ink px-3 py-2 text-xs font-medium text-white transition active:scale-95 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
          {error && <p className="col-span-full text-xs text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

const inp = "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs focus:border-strow-ink focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</label>
      {children}
    </div>
  );
}
