"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptOrderScan } from "@/app/owner/closings/scan-actions";

type Outcome = { id: string; date: string; status: "filled" | "not_pos" | "check" | "error"; reason?: string | null; transactions?: number | null };
export type ScanCheck = { id: string; date: string; reason: string | null; tx: number | null; drive: string | null };

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** One button that reads the order count off every past closing photo that doesn't have one yet. */
export function OrdersBackfill({ recent, all, checks }: { recent: number; all: number; checks: ScanCheck[] }) {
  const router = useRouter();
  const [scope, setScope] = useState<"recent" | "all">("recent");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<Outcome[]>([]);
  const [left, setLeft] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();
  const target = scope === "recent" ? recent : all;
  const total = done.length + (left ?? target);

  async function run() {
    setRunning(true);
    setErr(null);
    setDone([]);
    const errIds: string[] = [];
    try {
      for (let guard = 0; guard < 80; guard++) {
        const res = await fetch("/api/ai/backfill-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: scope === "recent" ? 40 : null, exclude: errIds }),
        });
        const j = (await res.json().catch(() => ({}))) as { outcomes?: Outcome[]; remaining?: number; error?: string };
        const outs = j.outcomes ?? [];
        outs.filter((o) => o.status === "error").forEach((o) => errIds.push(o.id));
        setDone((d) => [...d, ...outs]);
        setLeft(j.remaining ?? 0);
        if (j.error) {
          setErr(j.error);
          break;
        }
        if (!res.ok) {
          setErr(`Error ${res.status}`);
          break;
        }
        if (!outs.length || (j.remaining ?? 0) <= 0) break;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  const n = (s: Outcome["status"]) => done.filter((o) => o.status === s).length;
  if (!target && !checks.length && !done.length) return null;
  return (
    <section className="mb-6 flex flex-col gap-3 rounded-[24px] bg-white p-5">
      <div>
        <p className="font-display text-[17px] font-bold text-strow-ink">Orders &amp; app sales from past photos</p>
        <p className="mt-0.5 text-[13px] text-neutral-500">
          Reads the order counts and each app&apos;s sales (Talabat, Keeta, Beanz) off each POS photo, once. Saved only when the photo matches that day&apos;s closing. About 1 cent a photo.
        </p>
      </div>
      {all > recent && !running && !done.length ? (
        <div className="flex gap-2">
          {(["recent", "all"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={`h-9 rounded-full px-3.5 text-[13px] font-semibold ${scope === s ? "bg-strow-ink text-white" : "border border-neutral-300"}`}>
              {s === "recent" ? `Last 40 days (${recent})` : `All photos (${all})`}
            </button>
          ))}
        </div>
      ) : null}
      {running || done.length ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-2 rounded-full bg-strow-blue transition-all" style={{ width: `${total ? Math.round((done.length / total) * 100) : 100}%` }} />
          </div>
          <p className="text-[13px] text-neutral-600">
            {running ? `Reading… ${done.length} of ${total}` : "Done"} — filled {n("filled")} · handwritten {n("not_pos")} · to check {n("check")}
            {n("error") ? ` · failed ${n("error")}` : ""}
          </p>
        </div>
      ) : null}
      {target > 0 ? (
        <button type="button" disabled={running} onClick={() => void run()} className="min-h-12 rounded-full bg-strow-ink text-[15px] font-semibold text-white disabled:opacity-50">
          {running ? "Reading photos…" : `Read ${target} photo${target === 1 ? "" : "s"} (≈ $${Math.max(0.01, target * 0.008).toFixed(2)})`}
        </button>
      ) : null}
      {err ? <p className="text-[13px] text-red-700">{err}</p> : null}
      {checks.length ? (
        <div className="flex flex-col">
          <p className="text-[13px] font-semibold text-strow-ink">Take a look ({checks.length})</p>
          {checks.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#EDF0F3] py-2.5">
              <span className="min-w-0 flex-1 text-[13px]">
                <span className="font-semibold">{dayLabel(c.date)}</span>
                <span className="text-neutral-500"> — {c.reason ?? "needs a check"}</span>
              </span>
              {c.drive ? (
                <a href={c.drive} target="_blank" rel="noreferrer" className="rounded-full border border-neutral-300 px-3 py-1.5 text-[12.5px] font-semibold">
                  Photo
                </a>
              ) : null}
              {c.tx != null ? (
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => {
                    setBusyId(c.id);
                    start(async () => {
                      const r = await acceptOrderScan(c.id);
                      setBusyId(null);
                      if (r.error) setErr(r.error);
                      router.refresh();
                    });
                  }}
                  className="rounded-full bg-strow-ink px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  Use {c.tx} orders
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
