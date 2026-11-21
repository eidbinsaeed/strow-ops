"use client";

/**
 * "Let the AI handle all" — the bar at the top of Needs you.
 *
 * One tap hands every item that has no fix yet to Strow AI. It works through
 * them in the background, one after another, whether or not this page stays
 * open: the bar shows where it is, and a notification arrives at the end.
 * Items with a fix ready keep waiting for the owner's own tap.
 */
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { countsLine, type JobsStatus } from "@/lib/ai/job-types";
import { refreshAiJobs } from "@/components/ai/useAiJobs";
import { Sparkle } from "./icons";

const HIDDEN_KEY = "strow:ai-handover-hidden";

function Spinner({ light = false }: { light?: boolean }) {
  return <span aria-hidden className={`block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent motion-reduce:animate-none ${light ? "border-white" : "border-strow-blue"}`} />;
}

export function HandOver({
  jobs,
  eligible,
  tried,
  ready,
  estUsd,
  onFinished,
}: {
  jobs: JobsStatus | null;
  /** Open items without a fix that the AI has not looked at yet. */
  eligible: number;
  /** Open items the AI already looked at and left for the owner. */
  tried: number;
  /** Open items with a fix waiting for the owner's tap (never handed over). */
  ready: number;
  /** What one item costs on average (USD), from recent runs; null when unknown. */
  estUsd: number | null;
  onFinished?: () => void;
}) {
  const [confirm, setConfirm] = useState<null | "all" | "retry">(null);
  const [busy, setBusy] = useState<null | "start" | "stop">(null);
  const [err, setErr] = useState<string | null>(null);
  /** The hand-over this screen saw running: when it ends, the list here is brought up to date. */
  const [mine, setMine] = useState<string | null>(null);
  /** The result the owner closed with × (remembered for this visit to the app). */
  const [hidden, setHidden] = useState<string | null>(null);
  const told = useRef<string | null>(null);

  useEffect(() => {
    try {
      setHidden(window.sessionStorage.getItem(HIDDEN_KEY));
    } catch {
      /* private mode: the result just shows again */
    }
  }, []);
  const hide = (id: string) => {
    setHidden(id);
    try {
      window.sessionStorage.setItem(HIDDEN_KEY, id);
    } catch {
      /* fine */
    }
  };

  const batch = jobs?.batch ?? null;
  const last = jobs?.lastBatch ?? null;
  const item = jobs?.running.find((r) => r.kind === "item") ?? null;

  useEffect(() => {
    if (batch) setMine(batch.id);
  }, [batch]);

  // A hand-over that ended in the last few minutes (here, or while the owner was on another page): show how it went.
  const finished = !batch && last && hidden !== last.id ? last : null;
  useEffect(() => {
    if (finished && finished.id === mine && told.current !== finished.id) {
      told.current = finished.id;
      onFinished?.();
    }
  }, [finished, mine, onFinished]);

  async function start(retry: boolean) {
    setBusy("start");
    setErr(null);
    try {
      const r = await fetch("/api/ai/jobs/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(retry ? { retry: true } : {}) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; batchId?: string; error?: string };
      if (!r.ok || !j.ok || !j.batchId) throw new Error(j.error || "That didn't work");
      setMine(j.batchId);
      setConfirm(null);
      refreshAiJobs();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function stop() {
    if (!batch) return;
    setBusy("stop");
    setErr(null);
    try {
      await fetch("/api/ai/jobs/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: batch.id }) });
      refreshAiJobs();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // ---- Working
  if (batch) {
    const n = Math.min(batch.total, batch.done + 1);
    const pct = Math.max(4, Math.round((batch.done / Math.max(1, batch.total)) * 100));
    const nowText = item ? item.statusText || (item.title ?? "").replace(/^Fix:\s*/i, "") : "Starting the next one";
    return (
      <section aria-live="polite" className="flex flex-col gap-2.5 rounded-[24px] bg-strow-ink p-4 text-white">
        <div className="flex items-center gap-2.5">
          <Spinner light />
          <p className="min-w-0 flex-1 text-[15px] font-semibold">
            The AI is working · {n} of {batch.total}
          </p>
          <button type="button" onClick={stop} disabled={!!busy} className="h-9 shrink-0 rounded-full border border-white/30 px-3.5 text-[13px] font-semibold disabled:opacity-50">
            {busy === "stop" ? "Stopping…" : "Stop"}
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-1.5 rounded-full bg-white transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p dir="auto" className="truncate text-[13px] text-white/75">
          {nowText}
        </p>
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-white/60">You can leave this page. It keeps going.</span>
          {batch.chatId ? (
            <Link href={`/owner/assistant?c=${batch.chatId}` as Route} className="shrink-0 font-semibold underline-offset-4 hover:underline">
              Watch it work ›
            </Link>
          ) : null}
        </div>
        {err ? <p className="text-[13px] text-red-200">{err}</p> : null}
      </section>
    );
  }

  // ---- Just finished
  if (finished) {
    return (
      <section aria-live="polite" className="pulse-pop flex items-start gap-3 rounded-[24px] bg-white p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-[15px] font-semibold leading-tight">{finished.counts.canceled ? "The AI stopped" : "The AI finished"}</p>
          <p className="text-[13px] leading-snug text-neutral-500">{countsLine(finished.counts)}</p>
          {finished.chatId ? (
            <Link href={`/owner/assistant?c=${finished.chatId}` as Route} className="mt-1 text-[13px] font-semibold text-strow-blue">
              See what it did ›
            </Link>
          ) : null}
        </div>
        <button type="button" aria-label="Hide" onClick={() => hide(finished.id)} className="-me-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl leading-none text-neutral-400">
          ×
        </button>
      </section>
    );
  }

  // ---- Offer
  if (eligible < 2 && !(eligible === 0 && tried >= 2)) return null;
  const retryOnly = eligible === 0;
  const count = retryOnly ? tried : eligible;
  const cost = estUsd && estUsd > 0 ? Math.max(0.01, estUsd * count) : null;

  if (confirm) {
    const n = confirm === "retry" ? eligible + tried : eligible;
    const c = estUsd && estUsd > 0 ? Math.max(0.01, estUsd * n) : null;
    return (
      <section className="pulse-pop flex flex-col gap-3 rounded-[24px] bg-white p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-strow-blue text-white">
            <Sparkle className="h-5 w-5" />
          </span>
          <p className="text-[17px] font-semibold leading-tight">Hand {n === 1 ? "this one" : `all ${n}`} to the AI?</p>
        </div>
        <ul className="flex flex-col gap-1.5 text-sm leading-snug text-neutral-600">
          <li>It goes through them one by one in the background, about a minute or two each. You can keep using Strow or close it.</li>
          <li>It fixes what it can prove and closes the item. Every change has Undo in AI activity.</li>
          <li>What only you can settle stays here, with a note on what it found.</li>
          {ready ? <li>{ready === 1 ? "The one with a fix ready still waits" : `The ${ready} with a fix ready still wait`} for your own tap.</li> : null}
          {c ? <li>About ${c.toFixed(2)} of AI use, going by your recent runs.</li> : null}
        </ul>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => start(confirm === "retry")}
            className="h-12 flex-1 rounded-full bg-strow-ink text-[15px] font-semibold text-white transition active:scale-[.98] disabled:opacity-60"
          >
            {busy === "start" ? "Starting…" : "Start"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => setConfirm(null)} className="h-12 rounded-full border border-[#D5DAE1] bg-white px-5 text-[15px] font-semibold text-strow-ink disabled:opacity-50">
            Not now
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-1.5 rounded-[24px] bg-white p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-strow-blue text-white">
          <Sparkle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">{retryOnly ? `The AI already looked at these ${tried}` : `Let the AI handle all ${eligible}`}</p>
          <p className="text-[13px] leading-snug text-neutral-500">
            {retryOnly ? "They need you. It can try again after you change something." : `Works in the background${cost ? ` · about $${cost.toFixed(2)}` : ""}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setErr(null);
            setConfirm(retryOnly ? "retry" : "all");
          }}
          className="h-11 shrink-0 rounded-full bg-strow-ink px-4 text-sm font-semibold text-white transition active:scale-[.98]"
        >
          {retryOnly ? "Try again" : "Hand over"}
        </button>
      </div>
      {!retryOnly && tried ? <p className="ps-12 text-xs text-neutral-400">{tried} more it already looked at stay with you.</p> : null}
      {err ? <p className="ps-12 text-sm text-red-600">{err}</p> : null}
    </section>
  );
}
