"use client";

import { useState } from "react";
import { setStockSwitch, setStoreCountDay } from "./actions";
import { WEEKDAYS_AR, WEEKDAYS_EN, type Place } from "@/lib/stock";

/** Owner switches: show Shop stock / Store room count on the staff app. */
export function StockSwitches({ shop, store, day, ar }: { shop: boolean; store: boolean; day: number; ar: boolean }) {
  const [on, setOn] = useState<Record<Place, boolean>>({ shop, store });
  const [weekday, setWeekday] = useState(day);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const days = ar ? WEEKDAYS_AR : WEEKDAYS_EN;

  async function flip(kind: Place) {
    const value = !on[kind];
    setBusy(kind);
    setErr(null);
    setOn((s) => ({ ...s, [kind]: value }));
    try {
      const r = await setStockSwitch(kind, value);
      if ("error" in r) throw new Error(r.error);
    } catch (e) {
      setOn((s) => ({ ...s, [kind]: !value }));
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function pickDay(d: number) {
    const old = weekday;
    setWeekday(d);
    setBusy("day");
    setErr(null);
    try {
      const r = await setStoreCountDay(d);
      if ("error" in r) throw new Error(r.error);
    } catch (e) {
      setWeekday(old);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const row = (kind: Place, label: string, sub: React.ReactNode) => {
    const v = on[kind];
    return (
      <div className="flex items-center justify-between gap-4 border-t border-[#EDF0F3] py-3 first:border-t-0">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-strow-ink">{label}</p>
          <div className="text-[12.5px] leading-snug text-neutral-500">{v ? sub : ar ? "مخفي عن الموظفين" : "Hidden from staff"}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={v}
          aria-label={label}
          disabled={busy === kind}
          onClick={() => flip(kind)}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${v ? "bg-strow-blue" : "bg-neutral-300"}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${v ? "end-1" : "start-1"}`} />
        </button>
      </div>
    );
  };

  return (
    <section className="rounded-[28px] bg-white px-[18px] py-3 md:px-[22px]">
      <p className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{ar ? "في تطبيق الموظفين" : "On the staff app"}</p>
      {row("shop", ar ? "مخزون المحل" : "Shop stock", ar ? "عدّ يومي لما في المحل" : "Daily count of what is in the shop, with what was thrown away")}
      {row(
        "store",
        ar ? "جرد المخزن" : "Store room count",
        <label className="inline-flex items-center gap-1.5">
          {ar ? "أسبوعياً، كل" : "Weekly, every"}
          <select
            value={weekday}
            disabled={busy === "day"}
            onChange={(e) => pickDay(Number(e.target.value))}
            className="rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 text-[12.5px] font-semibold text-strow-ink"
          >
            {days.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>,
      )}
      {err ? <p className="pb-2 text-xs text-red-600">{err}</p> : null}
    </section>
  );
}
