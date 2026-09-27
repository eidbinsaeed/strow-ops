"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

export type StripDay = { iso: string; d: number; kind: "closed" | "missing" | "today" | "future"; value: number };

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function label(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}

/** The month at a glance: tap any day for its number; missing days link to the close flow. */
export function MonthStrip({ days }: { days: StripDay[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1500, ...days.map((x) => x.value));
  const sel = active != null ? days[active] : null;
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, days.length)}, minmax(0, 1fr))` };

  return (
    <div>
      <div className="mb-2 flex h-7 items-center gap-2 text-[13px]">
        {sel ? (
          <>
            <span className="font-semibold text-strow-ink">{label(sel.iso)}</span>
            {sel.kind === "closed" ? (
              <span className="tabular-nums text-neutral-500">AED {sel.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
            ) : sel.kind === "missing" ? (
              <>
                <span className="text-strow-amber">No closing</span>
                <Link href={`/close?date=${sel.iso}` as Route} className="ms-auto rounded-full bg-strow-ink px-3 py-1 text-xs font-semibold text-white">
                  Close this day
                </Link>
              </>
            ) : sel.kind === "today" ? (
              <span className="text-strow-blue">Today · not closed yet</span>
            ) : (
              <span className="text-neutral-500">Coming up</span>
            )}
          </>
        ) : (
          <span className="text-neutral-500">Tap a day to see it</span>
        )}
      </div>
      <div className="grid h-[132px] items-end gap-[3px] md:h-[220px] md:gap-1.5" style={cols}>
        {days.map((x, i) => (
          <button
            key={x.iso}
            type="button"
            aria-label={label(x.iso)}
            onClick={() => setActive(active === i ? null : i)}
            className="flex h-full flex-col items-center justify-end"
          >
            {x.kind === "closed" ? (
              <span
                className="pulse-bar block w-full rounded-[3px] md:rounded-[5px]"
                style={{
                  height: `${Math.max(4, Math.round((x.value / max) * 94))}%`,
                  background: active === i ? "#2350D0" : "#0F1C2B",
                  animationDelay: `${x.d * 28}ms`,
                }}
              />
            ) : x.kind === "missing" ? (
              <span
                className="pulse-bar block h-[22px] w-full rounded-[3px] border-[1.5px] border-dashed border-strow-amber md:h-[34px] md:rounded-[5px]"
                style={{ background: active === i ? "#FDF3E1" : undefined, animationDelay: `${x.d * 28}ms` }}
              />
            ) : x.kind === "today" ? (
              <span className="pulse-ping mb-0.5 block h-2 w-2 rounded-full bg-strow-blue md:h-3 md:w-3" />
            ) : (
              <span className="mb-1 block h-1 w-1 rounded-full bg-[#C9CFD7] md:h-[5px] md:w-[5px]" />
            )}
          </button>
        ))}
      </div>
      <div className="mt-1.5 grid gap-[3px] text-center text-[10px] text-neutral-500 md:gap-1.5 md:text-[11px]" style={cols}>
        {days.map((x) => (
          <span key={x.iso}>
            <span className="md:hidden">{[1, 7, 14, 21, 28].includes(x.d) ? x.d : ""}</span>
            <span className="hidden md:inline">{x.d}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
