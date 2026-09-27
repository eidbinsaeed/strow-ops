"use client";

import { useState } from "react";
import { setAutoApprove } from "@/app/owner/review/actions";

type Kind = "closings" | "bills";

/** The two auto-approve switches on the Review page. */
export function AutoApproveToggles({ closings, bills }: { closings: boolean; bills: boolean }) {
  const [on, setOn] = useState<Record<Kind, boolean>>({ closings, bills });
  const [busy, setBusy] = useState<Kind | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function flip(kind: Kind) {
    const value = !on[kind];
    setBusy(kind);
    setErr(null);
    setOn((s) => ({ ...s, [kind]: value }));
    try {
      const r = await setAutoApprove(kind, value);
      if (r?.error) throw new Error(r.error);
    } catch (e) {
      setOn((s) => ({ ...s, [kind]: !value }));
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const row = (kind: Kind, label: string) => {
    const v = on[kind];
    const what = kind === "closings" ? "closings" : "bills";
    return (
      <div className="flex items-center justify-between gap-4 border-t border-[#EDF0F3] py-3 first:border-t-0">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-strow-ink">{label}</p>
          <p className="text-[12.5px] leading-snug text-neutral-500">
            {v ? `Clean ${what} go straight into your books. Flagged ones wait here for you.` : `Every ${what.slice(0, -1)} waits here for your approval.`}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={v}
          aria-label={`Auto-approve ${what}`}
          disabled={busy === kind}
          onClick={() => flip(kind)}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${v ? "bg-[#2F7A5B]" : "bg-neutral-300"}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${v ? "end-1" : "start-1"}`} />
        </button>
      </div>
    );
  };

  return (
    <section className="mb-5 rounded-[24px] bg-white px-4 py-2">
      <div className="flex items-baseline justify-between gap-3 pt-2">
        <h2 className="text-[16px] font-bold">Auto-approve</h2>
        <span className="text-[12px] text-neutral-500">Flagged items always wait for you</span>
      </div>
      {row("closings", "Closings")}
      {row("bills", "Purchase bills")}
      <p className="border-t border-[#EDF0F3] py-2.5 text-[12px] leading-snug text-neutral-500">
        Flagged = numbers don&apos;t add up, the AI wasn&apos;t sure how to read something, an odd date or refunds — or Autopilot found a problem in the bill. Nothing here counts in your books until you approve it.
      </p>
      {err ? <p className="pb-2 text-xs text-red-600">{err}</p> : null}
    </section>
  );
}
