"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { saveStockCount, type RestockSummary } from "./actions";
import { fmtQty, roundToStep, type Place, type WasteReason } from "@/lib/stock";
import { CopyText } from "@/components/stock/CopyText";
import { WhatsAppButton } from "@/components/stock/WhatsAppButton";

export type CountItem = {
  id: string;
  name: string;
  unit: string;
  step: number;
  min: number | null;
  grp: string;
  sort: number;
  /** The last count before today (null = not counted then). */
  prev: number | null;
};

type WasteRow = { key: number; id: string; qty: string; reason: WasteReason };

const REASONS: { v: WasteReason; label: string }[] = [
  { v: "expired", label: "Expired" },
  { v: "spoiled", label: "Spoiled" },
  { v: "broken", label: "Broken / spilled" },
  { v: "other", label: "Other" },
];

/** "3", "0.5" → number; "" or junk → null. Accepts a comma as decimal point. */
function parse(v: string | undefined): number | null {
  if (v === undefined) return null;
  const t = v.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function StockCountForm({
  place,
  groups,
  prevLabel,
  intro,
  initial,
  fullCount = false,
}: {
  place: Place;
  groups: { name: string; items: CountItem[] }[];
  prevLabel: string | null;
  intro: string;
  /** Today is the full count (shop + store room, every item) used by the owner's waste check. */
  fullCount?: boolean;
  initial: { qty: Record<string, number>; waste: { id: string; qty: number; reason: WasteReason }[]; notes: string; savedLabel: string } | null;
}) {
  const all = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial?.qty ?? {}).map(([k, v]) => [k, fmtQty(v)])),
  );
  const [waste, setWaste] = useState<WasteRow[]>(() =>
    (initial?.waste ?? []).map((w, i) => ({ key: i, id: w.id, qty: fmtQty(w.qty), reason: w.reason })),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ label: string; low: string[]; restock: RestockSummary | null } | null>(
    initial ? { label: initial.savedLabel, low: [], restock: null } : null,
  );
  const [dirty, setDirty] = useState(false);

  const shop = place === "shop";
  const counted = all.filter((i) => parse(vals[i.id]) !== null);
  const bad = all.filter((i) => (vals[i.id] ?? "").trim() !== "" && parse(vals[i.id]) === null);
  const lowItems = counted.filter((i) => i.min !== null && (parse(vals[i.id]) as number) < i.min);
  const pct = all.length ? Math.round((counted.length / all.length) * 100) : 0;

  function set(id: string, v: string) {
    setVals((s) => ({ ...s, [id]: v }));
    setDirty(true);
  }
  function bump(it: CountItem, dir: 1 | -1) {
    const cur = parse(vals[it.id]);
    const next = cur === null ? (dir > 0 ? it.step : 0) : Math.max(0, roundToStep(cur + dir * it.step, it.step));
    set(it.id, fmtQty(next));
  }
  function editWaste(key: number, patch: Partial<WasteRow>) {
    setWaste((w) => w.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  async function save() {
    setErr(null);
    if (bad.length) return setErr(`Check the number for ${bad[0].name}.`);
    if (!counted.length) return setErr("Count at least one item.");
    if (fullCount && counted.length < all.length) {
      const left = all.filter((i) => parse(vals[i.id]) === null);
      const names = left.slice(0, 4).map((i) => i.name).join(", ") + (left.length > 4 ? ` and ${left.length - 4} more` : "");
      if (!window.confirm(`Full count today: ${left.length} not counted (${names}).\n\nIf there are none, type 0. Save anyway?`)) return;
    }
    const wasteOut: { id: string; qty: number; reason: WasteReason }[] = [];
    for (const w of waste) {
      if (!w.id && w.qty.trim() === "") continue;
      const it = byId.get(w.id);
      const q = parse(w.qty);
      if (!it) return setErr("Choose what was thrown away.");
      if (q === null || q <= 0) return setErr(`How much ${it.name} was thrown away?`);
      if (parse(vals[it.id]) === null) return setErr(`Count ${it.name} too.`);
      wasteOut.push({ id: it.id, qty: q, reason: w.reason });
    }
    setBusy(true);
    try {
      const r = await saveStockCount({
        place,
        lines: counted.map((i) => ({ id: i.id, qty: parse(vals[i.id]) as number })),
        waste: wasteOut,
        notes,
      });
      if (!r.ok) return setErr(r.error);
      const at = new Date(r.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Dubai" });
      setSaved({ label: `${r.updated ? "Updated" : "Saved"} at ${at}`, low: r.low, restock: r.restock });
      setDirty(false);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save. Check the internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {fullCount ? (
        <section className="rounded-2xl border border-[#F1D9A8] bg-[#FFF7E8] p-4 text-strow-ink">
          <p className="text-[15px] font-semibold">Full count today</p>
          <p className="mt-1 text-[13px] leading-snug">
            Count <span className="font-semibold">every item</span> on {shop ? "this list and the store room list" : "this list and the shop list"}, before opening if you
            can. None left? Type <span className="font-semibold">0</span>. An open pack counts as 0.5. The owner uses today&apos;s numbers to check waste.
          </p>
        </section>
      ) : null}
      <section className="rounded-2xl border border-neutral-300 bg-white p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold">
            {counted.length} of {all.length} counted
          </span>
          <span className={`text-[13px] font-semibold ${lowItems.length ? "text-strow-amber" : "text-neutral-500"}`}>
            {lowItems.length ? `${lowItems.length} low` : "Nothing low"}
          </span>
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-neutral-200">
          <div className="h-2 rounded-full bg-strow-ink transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2.5 text-[13px] leading-snug text-neutral-500">{intro}</p>
      </section>

      {groups.map((g) => (
        <section key={g.name} className="flex flex-col gap-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{g.name}</h2>
          <div className="overflow-hidden rounded-2xl border border-neutral-300 bg-white">
            {g.items.map((it, i) => {
              const v = parse(vals[it.id]);
              const low = v !== null && it.min !== null && v < it.min;
              const hint = it.prev !== null && prevLabel ? `${prevLabel} ${fmtQty(it.prev)}` : null;
              let note: { text: string; tone: string } | null = null;
              if (low) note = { text: `Low · minimum ${fmtQty(it.min as number)}`, tone: "text-strow-amber" };
              else if (!shop && v !== null && it.prev !== null && v > it.prev)
                note = { text: `+${fmtQty(v - it.prev)} since the last count (delivery?)`, tone: "text-[#1E7A4C]" };
              else if (!shop && v !== null && it.prev !== null && v < it.prev) note = { text: `−${fmtQty(it.prev - v)} since the last count`, tone: "text-neutral-500" };
              const inputId = `${place}-${it.id}`;
              return (
                <div key={it.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${i ? "border-t border-[#EEF1F4]" : ""} ${low ? "bg-[#FFF7E8]" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={inputId} className="block text-[15px] font-semibold leading-tight">
                      {it.name}
                    </label>
                    <span className="block text-xs text-neutral-500">
                      {it.unit}
                      {hint ? ` · ${hint}` : ""}
                    </span>
                    {note ? <span className={`block text-xs font-semibold ${note.tone}`}>{note.text}</span> : null}
                  </div>
                  {shop ? (
                    <button
                      type="button"
                      aria-label={`One less ${it.name}`}
                      onClick={() => bump(it, -1)}
                      className="h-11 w-11 shrink-0 rounded-xl border border-neutral-300 bg-neutral-50 text-[22px] leading-none text-strow-ink active:scale-95"
                    >
                      −
                    </button>
                  ) : null}
                  <input
                    id={inputId}
                    inputMode="decimal"
                    autoComplete="off"
                    value={vals[it.id] ?? ""}
                    placeholder={shop ? "–" : it.prev !== null ? fmtQty(it.prev) : "–"}
                    onChange={(e) => set(it.id, e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    className={`h-11 shrink-0 rounded-xl border bg-neutral-50 text-center text-lg font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-neutral-400 focus:border-strow-blue focus:ring-2 focus:ring-strow-blue/30 ${
                      shop ? "w-14" : "w-20"
                    } ${low ? "border-[#F1D9A8] text-strow-amber" : "border-neutral-300 text-strow-ink"}`}
                  />
                  {shop ? (
                    <button
                      type="button"
                      aria-label={`One more ${it.name}`}
                      onClick={() => bump(it, 1)}
                      className="h-11 w-11 shrink-0 rounded-xl bg-strow-ink text-[22px] leading-none text-white active:scale-95"
                    >
                      +
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {shop ? (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Thrown away today</h2>
          <div className="rounded-2xl border border-neutral-300 bg-white p-3">
            {waste.length === 0 ? (
              <p className="px-1 pb-2 text-[13px] text-neutral-500">Anything expired, spoiled or broken? Add it here so the owner knows where it went.</p>
            ) : null}
            {waste.map((w) => (
              <div key={w.key} className="mb-3 flex flex-col gap-2 border-b border-[#EEF1F4] pb-3 last:mb-2">
                <div className="flex gap-2">
                  <select
                    aria-label="What was thrown away"
                    value={w.id}
                    onChange={(e) => editWaste(w.key, { id: e.target.value })}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-300 bg-neutral-50 px-2 text-[15px]"
                  >
                    <option value="">Choose item…</option>
                    {all.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="How many"
                    inputMode="decimal"
                    value={w.qty}
                    placeholder="0"
                    onChange={(e) => editWaste(w.key, { qty: e.target.value })}
                    className="h-11 w-16 shrink-0 rounded-xl border border-neutral-300 bg-neutral-50 text-center text-lg font-semibold tabular-nums"
                  />
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => {
                      setWaste((x) => x.filter((r) => r.key !== w.key));
                      setDirty(true);
                    }}
                    className="h-11 w-11 shrink-0 rounded-xl border border-neutral-300 text-neutral-500"
                  >
                    ×
                  </button>
                </div>
                {w.id && byId.get(w.id) ? <span className="px-1 text-xs text-neutral-500">in {byId.get(w.id)?.unit}</span> : null}
                <div className="flex flex-wrap gap-1.5">
                  {REASONS.map((r) => (
                    <button
                      key={r.v}
                      type="button"
                      aria-pressed={w.reason === r.v}
                      onClick={() => editWaste(w.key, { reason: r.v })}
                      className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                        w.reason === r.v ? "bg-strow-ink text-white" : "border border-neutral-300 bg-white text-strow-ink"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setWaste((x) => [...x, { key: Date.now(), id: "", qty: "", reason: "expired" }]);
                setDirty(true);
              }}
              className="flex min-h-11 w-full items-center justify-center rounded-xl border border-dashed border-neutral-400 text-[15px] font-semibold text-strow-blue"
            >
              + Something thrown away
            </button>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <label htmlFor={`${place}-notes`} className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Note for the owner (optional)
        </label>
        <textarea
          id={`${place}-notes`}
          rows={2}
          value={notes}
          maxLength={1000}
          onChange={(e) => {
            setNotes(e.target.value);
            setDirty(true);
          }}
          placeholder={shop ? "e.g. ice cream freezer not cold" : "e.g. delivery from La Marquise came today"}
          className="rounded-2xl border border-neutral-300 bg-white p-3 text-[15px]"
        />
      </section>

      {err ? <p className="rounded-xl bg-[#FBE9E7] px-3 py-2.5 text-sm text-[#9A1B12]">{err}</p> : null}

      {saved && !dirty ? (
        <section className="flex flex-col gap-1.5 rounded-2xl bg-strow-ink p-4 text-white" role="status">
          <span className="text-base font-semibold">{saved.label}</span>
          <span className="text-sm text-[#C9D2DE]">
            {saved.low.length
              ? `${saved.low.join(", ")} below minimum. The owner has been told.`
              : lowItems.length
                ? `${lowItems.length} below minimum. The owner can see them.`
                : "Everything is above its minimum."}
          </span>
          <span className="text-xs text-[#C9D2DE]">Change a number and save again to update today&apos;s count.</span>
          {saved.restock ? (
            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-white/10 p-3">
              <span className="text-sm font-semibold">
                Order list ready
                <span className="font-normal text-[#C9D2DE]">
                  {" "}
                  · {saved.restock.moves ? `${saved.restock.moves} to bring from the store room` : ""}
                  {saved.restock.moves && saved.restock.orders ? ", " : ""}
                  {saved.restock.orders ? `${saved.restock.orders} to order` : ""}
                </span>
              </span>
              <div className="grid grid-cols-2 gap-2">
                <WhatsAppButton text={saved.restock.text} label="Send on WhatsApp" />
                <CopyText text={saved.restock.text} label="Copy list" done="Copied ✓" />
              </div>
              <Link href={"/stock/order" as Route} className="text-center text-xs font-semibold text-[#C9D2DE] underline">
                See the full order list
              </Link>
            </div>
          ) : null}
          <Link href="/home" className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-white text-[15px] font-semibold text-strow-ink">
            Back to home
          </Link>
        </section>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="min-h-14 rounded-2xl bg-strow-blue text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? "Saving…" : saved ? "Save changes" : shop ? "Save count" : "Save store count"}
          {!busy && counted.length < all.length ? <span className="block text-xs font-normal opacity-80">{all.length - counted.length} not counted</span> : null}
        </button>
      )}
      <p className="pb-4 text-center text-xs text-neutral-500">Items below their minimum go on the owner&apos;s order list.</p>
    </>
  );
}
