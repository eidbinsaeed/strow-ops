"use client";

import Link from "next/link";
import { useState } from "react";
import { PhotoViewer, photoSrc } from "@/components/ai/PhotoViewer";
import { askAiHref } from "@/components/ai/ActionButtons";
import { BackIcon, CheckIcon } from "./icons";

export type NyItem = {
  id: string;
  status: string;
  severity: string;
  title: string;
  detail: string | null;
  confidence: number | null;
  hasOps: boolean;
  opsCount: number;
  diffs: { label: string; from: string; to: string }[];
  photo: { table: string; id: string } | null;
  context: string | null;
  entityTable: string | null;
  entityId: string | null;
};

function sentences(t: string | null): string[] {
  if (!t) return [];
  return t
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

/** One finding at a time: the bill, what the app read vs what it should be, the proof, and one tap to fix. */
export function NeedsYouFlow({ items, start = 0 }: { items: NyItem[]; start?: number }) {
  const [i, setI] = useState(() => Math.min(Math.max(0, start), Math.max(0, items.length - 1)));
  const [st, setSt] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);

  if (!items.length) {
    return (
      <div className="mx-auto flex max-w-[440px] flex-col items-center gap-3 rounded-[28px] bg-white p-10 text-center">
        <span className="ai-orb h-12 w-12" aria-hidden />
        <p className="font-display text-xl font-bold">All clear</p>
        <p className="text-sm text-neutral-500">Nothing needs you right now. Autopilot keeps watching.</p>
        <Link href="/owner" className="mt-2 rounded-full bg-strow-ink px-5 py-2.5 text-sm font-semibold text-white">
          Back to Pulse
        </Link>
      </div>
    );
  }

  const it = items[i];
  const status = st[it.id] ?? it.status;
  const resolved = (x: NyItem) => ["applied", "rejected", "undone"].includes(st[x.id] ?? x.status);
  const doneCount = items.filter(resolved).length;
  const src = it.photo ? photoSrc(it.photo.table, it.photo.id) : null;
  const proof = sentences(it.detail);
  const open = status === "proposed" || status === "info";
  const tag =
    status === "applied"
      ? { t: "Fixed", c: "bg-emerald-50 text-emerald-700" }
      : status === "info"
        ? { t: "Needs you", c: "bg-[#FBE9E7] text-[#9A1B12]" }
        : status === "proposed" && it.hasOps
          ? { t: "Fix ready", c: "bg-[#E3EAFB] text-[#1A3FA8]" }
          : { t: status === "proposed" ? "Check" : status === "undone" ? "Undone" : "Dismissed", c: "bg-[#EEF0F3] text-[#3F4A57]" };

  async function decide(decision: "approve" | "reject" | "undo") {
    setBusy(decision);
    setErr(null);
    try {
      const r = await fetch("/api/ai/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, decision }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "That didn't work");
      setSt((s) => ({ ...s, [it.id]: j.status ?? status }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  const go = (d: number) => {
    setErr(null);
    setZoom(false);
    setI((x) => Math.min(items.length - 1, Math.max(0, x + d)));
  };

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <Link href="/owner" className="flex min-h-11 items-center gap-1.5 text-[15px] text-strow-ink">
          <BackIcon />
          Pulse
        </Link>
        <span className="text-[13px] text-neutral-500">
          {i + 1} of {items.length}
          {doneCount ? ` · ${doneCount} done` : ""}
        </span>
      </div>

      <div className="flex gap-1">
        {items.slice(0, 16).map((x, k) => (
          <button
            key={x.id}
            type="button"
            aria-label={`Finding ${k + 1}`}
            onClick={() => {
              setZoom(false);
              setErr(null);
              setI(k);
            }}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: k === i ? "#2350D0" : resolved(x) ? "#0F1C2B" : "#C9CFD7" }}
          />
        ))}
      </div>

      <div key={it.id} className="pulse-pop flex flex-col gap-3.5 rounded-[28px] bg-white p-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[22px] font-bold leading-tight tracking-[-0.4px]">{it.title}</h1>
            {it.context ? <p className="mt-1 text-[13px] text-neutral-500">{it.context}</p> : null}
          </div>
          <span className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-semibold ${tag.c}`}>{tag.t}</span>
        </div>

        {src ? (
          <button type="button" onClick={() => setZoom(true)} className="relative h-[250px] overflow-hidden rounded-2xl bg-[#F3F4F6]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Bill photo" className="h-full w-full object-cover object-[center_40%]" />
            {open ? <span className="pulse-scan absolute inset-x-0 top-0 h-0.5 bg-strow-blue shadow-[0_0_12px_2px_rgba(35,80,208,0.6)]" /> : null}
            <span className="absolute bottom-2 end-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white">Tap to zoom</span>
          </button>
        ) : null}

        {it.diffs.length ? (
          <div className="flex flex-col gap-2.5">
            {it.diffs.map((d, k) => (
              <div key={k} className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1 rounded-2xl bg-[#FBE9E7] p-3">
                  <span className="text-xs font-semibold text-[#9A1B12]">{d.label} · {status === "applied" ? "was" : "now"}</span>
                  <span className={`break-words text-[15px] font-semibold text-[#9A1B12] ${status === "undone" || status === "rejected" ? "" : "line-through"}`}>{d.from}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-2xl bg-[#E3EAFB] p-3">
                  <span className="text-xs font-semibold text-[#1A3FA8]">{status === "applied" ? "Fixed to" : "Should be"}</span>
                  <span className="break-words text-[15px] font-semibold text-strow-ink">{d.to}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {proof.length ? (
          <div className="flex flex-col gap-2.5 border-t border-[#EDF0F3] pt-3.5">
            <span className="text-sm font-semibold">How Autopilot knows</span>
            {proof.map((p, k) => (
              <div key={k} className="flex items-start gap-2.5 text-sm leading-snug">
                <span className="mt-px shrink-0">
                  <CheckIcon />
                </span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        ) : null}
        {it.confidence != null && it.status !== "info" ? (
          <p className="text-xs text-neutral-500">Confidence {Math.round(Number(it.confidence) * 100)}%</p>
        ) : null}
      </div>

      {status === "proposed" && it.hasOps ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => decide("approve")}
            className="h-14 rounded-full bg-strow-ink text-base font-semibold text-white transition active:scale-[.98] disabled:opacity-60"
          >
            {busy === "approve" ? "Fixing…" : it.opsCount > 1 ? `Apply ${it.opsCount} fixes` : "Apply fix"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => decide("reject")} className="h-11 text-sm text-neutral-500">
            {busy === "reject" ? "…" : "Dismiss"}
          </button>
        </div>
      ) : open ? (
        <div className="flex flex-col gap-1.5">
          <Link
            href={askAiHref(it.title, it.entityTable, it.entityId)}
            className="flex h-14 items-center justify-center rounded-full bg-strow-ink text-base font-semibold text-white transition active:scale-[.98]"
          >
            ✦ Ask AI to handle it
          </Link>
          <button type="button" disabled={!!busy} onClick={() => decide("reject")} className="h-11 text-sm text-neutral-500">
            {busy === "reject" ? "…" : "Dismiss"}
          </button>
        </div>
      ) : status === "applied" ? (
        <div className="pulse-pop flex items-center justify-between gap-3 rounded-3xl bg-strow-ink px-[18px] py-4 text-white">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Fixed</span>
            <span className="text-[13px] text-[#B9C3D0]">Saved with the before-state. Undo any time.</span>
          </div>
          <button type="button" disabled={!!busy} onClick={() => decide("undo")} className="h-11 shrink-0 rounded-full border border-white/30 px-4 text-sm font-semibold">
            {busy === "undo" ? "…" : "Undo"}
          </button>
        </div>
      ) : (
        <div className="pulse-pop rounded-3xl bg-white px-[18px] py-4 text-sm text-neutral-500">
          {status === "undone" ? "Undone — back to how it was." : "Dismissed."}
        </div>
      )}
      {err ? <p className="text-center text-sm text-red-600">{err}</p> : null}

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} disabled={i === 0} className="h-11 rounded-full px-4 text-sm text-strow-ink disabled:opacity-30">
          ‹ Previous
        </button>
        <button type="button" onClick={() => go(1)} disabled={i >= items.length - 1} className="h-11 rounded-full bg-white px-5 text-sm font-semibold text-strow-ink disabled:opacity-30">
          Next ›
        </button>
      </div>
      {zoom && src ? <PhotoViewer src={src} caption={it.title} onClose={() => setZoom(false)} /> : null}
    </div>
  );
}
