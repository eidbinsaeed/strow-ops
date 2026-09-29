"use client";

import { useMemo, useState } from "react";
import { reconcileVat } from "@/lib/vat";
import {
  baseOf,
  COUNT_UNITS,
  describeQty,
  fmtQty,
  LINE_KINDS,
  num,
  SIZE_UNITS,
  sumByBase,
  type LineKind,
} from "@/lib/units";

type Confidence = "high" | "medium" | "low";

/** A bill line as the AI returned it (all goods fields optional). */
export type RawLine = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  discount?: number;
  vat_amount?: number;
  inventory_item_id: string | null;
  suggested_item_name: string | null;
  matched_item_name?: string | null;
  match_confidence?: Confidence;
  line_kind?: LineKind | null;
  brand?: string | null;
  uom_printed?: string | null;
  count_qty?: number | null;
  count_uom?: string | null;
  unit_size?: number | null;
  size_uom?: string | null;
  pack_qty?: number | null;
  pack_type?: string | null;
  units_per_pack?: number | null;
  vat_rate?: number | null;
  set_parts?: string[] | null;
  qty_note?: string | null;
  qty_confidence?: Confidence | null;
};

type Line = RawLine & { key: number };

function isKind(v: unknown): v is LineKind {
  return LINE_KINDS.some((k) => k.v === v);
}

function prepare(raw: RawLine[]): Line[] {
  return raw.map((r, i) => {
    const kind: LineKind = isKind(r.line_kind) ? r.line_kind : "goods";
    return {
      ...r,
      key: i,
      line_kind: kind,
      // Old-style extraction (no goods fields) → fall back to the billed qty.
      count_qty: r.count_qty ?? (kind === "goods" ? r.quantity || null : null),
      count_uom: r.count_uom ?? (kind === "goods" ? r.uom_printed || "pcs" : null),
    };
  });
}

const aed = (n: number) =>
  `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * "Items received" — what physically arrived on this bill, per line:
 * count, pack structure and size, converted to L / kg / pcs.
 * Emits the final lines as a hidden `line_items` input for the form.
 */
export function ItemsReceived({
  initial,
  subtotal,
  vat,
  total,
  rounding,
  pricesIncludeVat = null,
  goodsReceived = true,
}: {
  initial: RawLine[];
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  rounding: number | null;
  pricesIncludeVat?: boolean | null;
  goodsReceived?: boolean;
}) {
  const [lines, setLines] = useState<Line[]>(() => prepare(initial));
  const [open, setOpen] = useState<number | null>(null);

  const computed = useMemo(
    () =>
      lines.map((l) => {
        const b = l.line_kind === "goods" ? baseOf(l) : { base_qty: null, base_uom: null };
        return { ...l, ...b };
      }),
    [lines],
  );

  // Works out on its own whether the printed prices include VAT, then gives
  // every line its net amount + VAT share (what's saved) and a paid price.
  const vr = useMemo(
    () => reconcileVat(computed, { subtotal, vat, total, rounding, pricesIncludeVat }),
    [computed, subtotal, vat, total, rounding, pricesIncludeVat],
  );
  const shown = vr.lines;
  const goods = shown.filter((l) => l.line_kind === "goods");
  const paidSum = shown.reduce((s, l) => s + l.line_total + l.vat_amount, 0);

  function patch(key: number, p: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  }

  if (lines.length === 0) return null;

  const payload = shown.map(({ key: _k, qty_note: _n, matched_item_name: _m, ...rest }) => rest);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white">
      <input type="hidden" name="line_items" value={JSON.stringify(payload)} />

      <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Items received</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {goods.length} {goods.length === 1 ? "item" : "items"}
            {goods.length > 0 && sumByBase(goods) ? ` · ${sumByBase(goods)}` : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            {vr.message}
            {vr.rounding ? ` · rounding ${vr.rounding > 0 ? "+" : ""}${vr.rounding.toFixed(2)}` : ""}
            {!goodsReceived ? " · not added to stock" : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            vr.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {vr.ok ? `Adds up ✓ ${aed(total ?? paidSum)}` : `Lines ${aed(paidSum)} ≠ ${aed(total ?? 0)}`}
        </span>
      </header>

      <ul className="divide-y divide-neutral-100">
        {shown.map((l) => {
          const isGoods = l.line_kind === "goods";
          // Amber only when the AI is genuinely unsure — not for every note.
          const unsure = isGoods && (l.qty_confidence === "low" || l.qty_confidence === "medium");
          const paid = l.line_total + l.vat_amount;
          // Sets (cup + lid) are priced per set; everything else per L / kg / pc.
          const isSet = (l.set_parts?.length ?? 0) > 1;
          const perDen = isSet ? Number(l.count_qty) : l.base_qty;
          const perBase = isGoods && perDen && perDen > 0 ? paid / perDen : null;
          const perUnit = isSet ? "set" : l.base_uom;
          const desc = isGoods ? describeQty(l) : "";
          const baseTxt = l.base_qty != null ? fmtQty(l.base_qty, l.base_uom) : "";
          const name = l.matched_item_name || l.suggested_item_name || l.description;
          const editing = open === l.key;
          return (
            <li key={l.key} className={`px-4 py-3 ${unsure ? "bg-amber-50/60" : ""}`}>
              <button
                type="button"
                onClick={() => setOpen(editing ? null : l.key)}
                className="flex w-full items-start justify-between gap-3 text-start"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {name}
                    {!isGoods && (
                      <span className="ms-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-500">
                        {LINE_KINDS.find((k) => k.v === l.line_kind)?.label}
                      </span>
                    )}
                  </p>
                  {name !== l.description && (
                    <p className="truncate text-[11px] text-neutral-400">{l.description}</p>
                  )}
                  {isGoods && (
                    <p className="mt-1 text-xs text-neutral-700">
                      {desc}
                      {l.base_qty != null && baseTxt !== desc && (
                        <>
                          {" "}
                          <span className="text-neutral-400">→</span>{" "}
                          <span className="font-semibold">{baseTxt}</span>
                        </>
                      )}
                    </p>
                  )}
                  {l.qty_note && (
                    <p className={`mt-1 text-[11px] ${unsure ? "text-amber-700" : "text-neutral-400"}`}>{l.qty_note}</p>
                  )}
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-sm tabular-nums">{aed(paid)}</p>
                  {perBase != null && (
                    <p className="text-[11px] tabular-nums text-neutral-400">
                      {aed(perBase)} / {perUnit}
                    </p>
                  )}
                  {l.vat_amount > 0 && <p className="text-[10px] text-neutral-400">incl. VAT</p>}
                  <p className="mt-1 text-[10px] text-neutral-400 underline">{editing ? "Done" : "Edit"}</p>
                </div>
              </button>

              {editing && (
                <div className="mt-3 space-y-2 rounded-xl bg-neutral-50 p-3">
                  <Row label="Type">
                    <select
                      value={l.line_kind ?? "goods"}
                      onChange={(e) => patch(l.key, { line_kind: e.target.value as LineKind })}
                      className={inputCls}
                    >
                      {LINE_KINDS.map((k) => (
                        <option key={k.v} value={k.v}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </Row>
                  {isGoods && (
                    <>
                      <Row label="Item name">
                        <input
                          value={l.suggested_item_name ?? ""}
                          placeholder={l.description}
                          onChange={(e) => patch(l.key, { suggested_item_name: e.target.value || null })}
                          className={inputCls}
                        />
                      </Row>
                      <Row label="Received">
                        <div className="flex gap-2">
                          <NumIn value={l.count_qty} onChange={(v) => patch(l.key, { count_qty: v })} />
                          <UnitIn
                            list="count-units"
                            value={l.count_uom}
                            onChange={(v) => patch(l.key, { count_uom: v })}
                          />
                        </div>
                      </Row>
                      <Row label="Each is">
                        <div className="flex gap-2">
                          <NumIn value={l.unit_size} onChange={(v) => patch(l.key, { unit_size: v })} placeholder="size" />
                          <UnitIn
                            list="size-units"
                            value={l.size_uom}
                            onChange={(v) => patch(l.key, { size_uom: v })}
                          />
                        </div>
                      </Row>
                      <Row label="Set of">
                        <input
                          value={(l.set_parts ?? []).join(" + ")}
                          placeholder="e.g. cup + lid (leave empty if single)"
                          onChange={(e) => {
                            const parts = e.target.value.split("+").map((x) => x.trim()).filter(Boolean);
                            patch(l.key, { set_parts: parts.length ? parts : null, ...(parts.length > 1 ? { count_uom: "set" } : {}) });
                          }}
                          className={inputCls}
                        />
                      </Row>
                      <Row label="Packed as">
                        <div className="flex items-center gap-2">
                          <NumIn value={l.pack_qty} onChange={(v) => patch(l.key, { pack_qty: v })} placeholder="4" />
                          <UnitIn
                            list="count-units"
                            value={l.pack_type}
                            onChange={(v) => patch(l.key, { pack_type: v })}
                            placeholder="box"
                          />
                          <span className="text-xs text-neutral-400">of</span>
                          <NumIn
                            value={l.units_per_pack}
                            onChange={(v) =>
                              patch(l.key, {
                                units_per_pack: v,
                                // Keep the count in step with the packs when both are known.
                                ...(v && num(l.pack_qty) ? { count_qty: v * (num(l.pack_qty) as number) } : {}),
                              })
                            }
                            placeholder="6"
                          />
                        </div>
                      </Row>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <datalist id="count-units">
        {COUNT_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id="size-units">
        {SIZE_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </section>
  );
}

const inputCls =
  "w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:border-strow-ink focus:outline-none";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <span className="text-[11px] font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function NumIn({
  value,
  onChange,
  placeholder,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      min="0"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(num(e.target.value))}
      className={`${inputCls} w-20 flex-none`}
    />
  );
}

function UnitIn({
  value,
  onChange,
  list,
  placeholder,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  list: string;
  placeholder?: string;
}) {
  return (
    <input
      list={list}
      value={value ?? ""}
      placeholder={placeholder ?? "unit"}
      onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
      className={inputCls}
    />
  );
}
