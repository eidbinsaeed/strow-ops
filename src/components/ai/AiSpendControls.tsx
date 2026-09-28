"use client";

import { useState, useTransition } from "react";
import { setAiBudget, setAiDeep } from "@/app/owner/assistant/actions";

/** Deep mode switch (Opus for chat) and the monthly AI budget that pauses Autopilot. */
export function AiSpendControls({ deep, budget }: { deep: boolean; budget: number }) {
  const [d, setD] = useState(deep);
  const [b, setB] = useState(budget);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 border-t border-[#EDF0F3] pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strow-ink">Deep mode</p>
          <p className="text-xs leading-snug text-neutral-500">Chat uses Opus 5.5 — sharper on hard questions, about 2× the cost. Off = Sonnet 5.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={d}
          aria-label="Deep mode"
          disabled={pending}
          onClick={() => {
            const v = !d;
            setD(v);
            setErr(null);
            start(async () => {
              const r = await setAiDeep(v);
              if (r?.error) {
                setErr(r.error);
                setD(!v);
              }
            });
          }}
          className={`relative h-8 w-14 shrink-0 rounded-full transition ${d ? "bg-strow-blue" : "bg-neutral-300"}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${d ? "start-7" : "start-1"}`} />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-sm font-semibold text-strow-ink">Monthly budget</p>
          <p className="text-xs text-neutral-500">Autopilot pauses when it&apos;s reached. Chat keeps working.</p>
        </div>
        <div className="flex gap-2">
          {[10, 20, 40, 80].map((v) => (
            <button
              key={v}
              type="button"
              disabled={pending}
              onClick={() => {
                const old = b;
                setB(v);
                setErr(null);
                start(async () => {
                  const r = await setAiBudget(v);
                  if (r?.error) {
                    setErr(r.error);
                    setB(old);
                  }
                });
              }}
              className={`h-10 flex-1 rounded-full text-sm font-semibold transition ${b === v ? "bg-strow-ink text-white" : "border border-neutral-300 text-strow-ink"}`}
            >
              ${v}
            </button>
          ))}
        </div>
      </div>
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
    </div>
  );
}
