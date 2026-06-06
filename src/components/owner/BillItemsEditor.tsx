"use client";

import { useEffect, useState, useTransition } from "react";
import { getExpenseLines, saveExpenseLines, type LineDraft } from "@/app/owner/items/actions";

type ItemOpt = { id: string; name: string; kind: string | null };

type Row = {
  id?: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  inventory_item_id: string;
};

export function BillItemsEditor({ expenseId, onClose }: { expenseId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [items, setItems] = useState<ItemOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getExpenseLines(expenseId).then((res) => {
      if (!alive) return;
      setItems(res.items);
      setRows(
        res.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: String(l.quantity),
          unit_price: String(l.unit_price),
          line_total: String(l.line_total),
          inventory_item_id: l.inventory_item_id ?? "",
        })),
      );
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [expenseId]);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { description: "", quantity: "1", unit_price: "0", line_total: "", inventory_item_id: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function save() {
    setError(null);
    const drafts: LineDraft[] = rows.map((r) => ({
      id: r.id,
      description: r.description,
      quantity: parseFloat(r.quantity) || 0,
      unit_price: parseFloat(r.unit_price) || 0,
      line_total: r.line_total.trim() === "" ? null : parseFloat(r.line_total),
      inventory_item_id: r.inventory_item_id || null,
    }));
    startTransition(async () => {
      const res = await saveExpenseLines(expenseId, drafts);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-medium">Edit items on this bill</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-neutral-500">No line items yet. Add one below.</p>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-12 gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400 sm:grid">
                <div className="col-span-4">Description</div>
                <div className="col-span-3">Item</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-2">Unit price</div>
                <div className="col-span-2">Line total</div>
              </div>
              {rows.map((r, i) => (
                <div key={r.id ?? `new-${i}`} className="grid grid-cols-12 items-center gap-2">
                  <input className={cell + " col-span-12 sm:col-span-4"} value={r.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="As written on receipt" />
                  <select className={cell + " col-span-6 sm:col-span-3"} value={r.inventory_item_id} onChange={(e) => update(i, { inventory_item_id: e.target.value })}>
                    <option value="">— not an item —</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                  </select>
                  <input className={cell + " col-span-2 sm:col-span-1"} type="number" step="0.001" min="0" inputMode="decimal" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                  <input className={cell + " col-span-2 sm:col-span-2"} type="number" step="0.01" min="0" inputMode="decimal" value={r.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} />
                  <input className={cell + " col-span-1 sm:col-span-1"} type="number" step="0.01" min="0" inputMode="decimal" placeholder="auto" value={r.line_total} onChange={(e) => update(i, { line_total: e.target.value })} />
                  <button type="button" onClick={() => removeRow(i)} className="col-span-1 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50" title="Remove">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={addRow} className="mt-3 rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
            + Add item / split a line
          </button>
          {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={pending || loading} className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50">
            {pending ? "Saving…" : "Save items"}
          </button>
        </div>
      </div>
    </div>
  );
}

const cell = "rounded-lg border border-neutral-300 px-2 py-1.5 text-xs focus:border-strow-ink focus:outline-none";
