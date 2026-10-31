"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { PhotoViewer, photoSrc } from "@/components/ai/PhotoViewer";
import { askAiHref } from "@/components/ai/ActionButtons";
import { SuccessTick } from "@/components/motion/SuccessTick";
import { motion, reducedMotion } from "@/lib/motion";
import { BackIcon, CheckIcon } from "./icons";

type Toast = { id: string; title: string; kind: "fixed" | "dismissed" | "closed"; side: number };
type RedoStep = { text: string; note?: string; ok?: boolean };

export type NyItem = {
  id: string;
  status: string;
  severity: string;
  title: string;
  detail: string | null;
  confidence: number | null;
  hasOps: boolean;
  opsCount: number;
  /** "what" = which bill line the change is on, shown above its row. */
  diffs: { label: string; from: string; to: string; what?: string; keep?: boolean }[];
  /** The note the owner wrote when he had the AI redo this fix. */
  note?: string | null;
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
  const [toast, setToast] = useState<Toast | null>(null);
  const [cleared, setCleared] = useState(false);
  // "Redo with my note": the box, what's typed, and the AI's steps while it rebuilds the fix.
  const [composer, setComposer] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [redo, setRedo] = useState<{ steps: RedoStep[]; done?: string } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const router = useRouter();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  // Which side the next card comes in from: 0 = from below (first load, Next / Previous), ±1 = back from where it flew.
  const enterSide = useRef(0);
  const current = items[i]?.id ?? "";

  // The card (and its buttons) arrive: from below, or back in from the side it left on Undo.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el || reducedMotion()) return;
    const { gsap } = motion();
    const side = enterSide.current;
    enterSide.current = 0;
    const tween = side
      ? gsap.fromTo(el, { x: side * 420, rotation: side * 8, opacity: 0 }, { x: 0, rotation: 0, opacity: 1, duration: 0.55, ease: "back.out(1.1)", clearProps: "transform,opacity" })
      : gsap.fromTo(el, { x: 0, rotation: 0, y: 22, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "power3.out", clearProps: "transform,opacity" });
    return () => {
      tween.progress(1);
    };
  }, [current, cleared]);

  // The undo toast rises in and leaves after 5 s.
  useEffect(() => {
    if (!toast) return;
    const el = toastRef.current;
    if (el && !reducedMotion()) motion().gsap.fromTo(el, { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.6)" });
    const t = window.setTimeout(() => {
      const node = toastRef.current;
      if (node && !reducedMotion()) motion().gsap.to(node, { y: 80, opacity: 0, duration: 0.3, ease: "power2.in", onComplete: () => setToast(null) });
      else setToast(null);
    }, 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!items.length || cleared) {
    const handled = items.filter((x) => ["applied", "rejected", "undone", "resolved"].includes(st[x.id] ?? x.status)).length;
    return (
      <>
        <div ref={stage} className="mx-auto flex max-w-[440px] flex-col items-center gap-3 rounded-[28px] bg-white p-10 text-center">
          {cleared ? <SuccessTick size={76} label="All clear" /> : <span className="ai-orb h-12 w-12" aria-hidden />}
          <p className="font-display text-xl font-bold">All clear</p>
          <p className="text-sm text-neutral-500">
            {cleared && handled ? `${handled} handled. ` : ""}Nothing needs you right now. Autopilot keeps watching.
          </p>
          <Link href="/owner" className="mt-2 rounded-full bg-strow-ink px-5 py-2.5 text-sm font-semibold text-white">
            Back to Home
          </Link>
        </div>
        {toast ? <UndoToast refEl={toastRef} toast={toast} onUndo={() => undoFromToast(toast)} /> : null}
      </>
    );
  }

  const it = items[i];
  const status = st[it.id] ?? it.status;
  const resolved = (x: NyItem) => ["applied", "rejected", "undone", "resolved"].includes(st[x.id] ?? x.status);
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
          : { t: status === "proposed" ? "Check" : status === "undone" ? "Undone" : status === "resolved" ? "Closed" : "Dismissed", c: "bg-[#EEF0F3] text-[#3F4A57]" };

  async function send(id: string, decision: "approve" | "reject" | "undo"): Promise<string | null> {
    const r = await fetch("/api/ai/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error || "That didn't work");
    return j.status ?? null;
  }

  /** The card flies off (left when fixed, right when dismissed), then the next open finding comes in. */
  function flyOff(side: number): Promise<void> {
    const el = stage.current;
    if (!el || reducedMotion()) return Promise.resolve();
    return new Promise((done) => {
      motion().gsap.to(el, { x: side * 440, y: side < 0 ? -30 : 10, rotation: side * 9, opacity: 0, duration: 0.4, ease: "power2.in", onComplete: () => done() });
    });
  }

  async function decide(decision: "approve" | "reject" | "undo") {
    setBusy(decision);
    setErr(null);
    try {
      const next = await send(it.id, decision);
      const newStatus = next ?? status;
      const after = { ...st, [it.id]: newStatus };
      if (decision === "undo") {
        setSt(after);
        return;
      }
      const side = decision === "approve" ? -1 : 1;
      await flyOff(side);
      setSt(after);
      setToast({ id: it.id, title: it.title, kind: decision === "approve" ? "fixed" : "dismissed", side });
      setZoom(false);
      const isOpen = (x: NyItem) => ["proposed", "info"].includes(after[x.id] ?? x.status);
      const order = [...items.slice(i + 1), ...items.slice(0, i)];
      const nxt = order.find(isOpen);
      if (nxt) setI(items.findIndex((x) => x.id === nxt.id));
      else setCleared(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      if (stage.current) motion().gsap.set(stage.current, { clearProps: "transform,opacity" });
      // A fix that can't be applied is exactly when a note helps: open the box.
      if (decision === "approve") openComposer();
    } finally {
      setBusy(null);
    }
  }

  function openComposer() {
    setComposer(true);
    setHint(null);
    window.setTimeout(() => noteRef.current?.focus(), 60);
  }

  /** The AI rebuilds the fix with the owner's note (nothing changes until he taps Apply on the new one). */
  async function redoWithNote() {
    const note = noteText.trim();
    setBusy("redo");
    setErr(null);
    setHint(null);
    setRedo({ steps: [] });
    let result: { ok?: boolean; status?: string; newId?: string; message?: string } | null = null;
    try {
      const r = await fetch("/api/ai/actions/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, note }),
      });
      if (!r.ok || !r.body) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "That didn't work");
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let e: { t: string; text?: string; ok?: boolean; status?: string; newId?: string; message?: string };
          try {
            e = JSON.parse(line);
          } catch {
            continue;
          }
          if (e.t === "status" && e.text) {
            const text = e.text;
            setRedo((cur) => {
              const steps = cur?.steps ?? [];
              if (steps.length && steps[steps.length - 1].text === text) return cur;
              return { steps: [...steps, { text }].slice(-6) };
            });
          } else if (e.t === "note" && e.text) {
            const text = e.text;
            setRedo((cur) => {
              if (!cur?.steps.length) return cur;
              const steps = cur.steps.slice();
              steps[steps.length - 1] = { ...steps[steps.length - 1], note: text, ok: e.ok };
              return { steps };
            });
          } else if (e.t === "result") result = e;
        }
      }
    } catch (e) {
      // The phone may have dropped the connection; the server still finishes, so reload to see the new fix.
      setRedo(null);
      setBusy(null);
      setHint("The connection dropped while the AI was working. Pull down to refresh in a minute to see the new fix.");
      setErr(e instanceof Error && e.message !== "Load failed" ? e.message : null);
      return;
    }
    const res = result as { ok?: boolean; status?: string; newId?: string; message?: string } | null;
    if (res?.ok && res.status === "replaced" && res.newId) {
      setRedo({ steps: [], done: "New fix ready" });
      router.replace(`/owner/needs-you?id=${res.newId}` as Route);
      router.refresh();
      return;
    }
    if (res?.ok && res.status === "resolved") {
      await flyOff(1);
      const after = { ...st, [it.id]: "resolved" };
      setSt(after);
      setRedo(null);
      setBusy(null);
      setComposer(false);
      setNoteText("");
      setToast({ id: it.id, title: it.title, kind: "closed", side: 1 });
      const isOpen = (x: NyItem) => ["proposed", "info"].includes(after[x.id] ?? x.status);
      const nxt = [...items.slice(i + 1), ...items.slice(0, i)].find(isOpen);
      if (nxt) setI(items.findIndex((x) => x.id === nxt.id));
      else setCleared(true);
      return;
    }
    setRedo(null);
    setBusy(null);
    setHint(res?.message ?? "The AI couldn't rebuild the fix this time. Try a clearer note.");
  }

  async function undoFromToast(t: Toast) {
    setToast(null);
    try {
      const back = await send(t.id, "undo");
      setSt((s) => ({ ...s, [t.id]: back ?? "undone" }));
      enterSide.current = t.side;
      setCleared(false);
      setErr(null);
      setI(Math.max(0, items.findIndex((x) => x.id === t.id)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  const go = (d: number) => {
    setErr(null);
    setZoom(false);
    setComposer(false);
    setNoteText("");
    setHint(null);
    setI((x) => Math.min(items.length - 1, Math.max(0, x + d)));
  };

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <Link href="/owner" className="flex min-h-11 items-center gap-1.5 text-[15px] text-strow-ink">
          <BackIcon />
          Home
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
              setComposer(false);
              setNoteText("");
              setHint(null);
              setI(k);
            }}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: k === i ? "#2350D0" : resolved(x) ? "#0F1C2B" : "#C9CFD7" }}
          />
        ))}
      </div>

      <div ref={stage} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-3.5 rounded-[28px] bg-white p-[18px]">
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
                {d.what ? <p className="col-span-2 -mb-1 truncate text-xs text-neutral-500">{d.what}</p> : null}
                <div className="flex flex-col gap-1 rounded-2xl bg-[#FBE9E7] p-3">
                  <span className="text-xs font-semibold text-[#9A1B12]">{d.label} · {status === "applied" ? "was" : "now"}</span>
                  <span className={`break-words text-[15px] font-semibold text-[#9A1B12] ${status === "undone" || status === "rejected" || d.keep || d.from === "—" ? "" : "line-through"}`}>{d.from}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-2xl bg-[#E3EAFB] p-3">
                  <span className="text-xs font-semibold text-[#1A3FA8]">{status === "applied" ? "Fixed to" : "Should be"}</span>
                  <span className="break-words text-[15px] font-semibold text-strow-ink">{d.to}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {it.note ? (
          <div className="flex flex-col gap-1 rounded-2xl bg-[#F2F2F7] px-3.5 py-3">
            <span className="text-xs font-semibold text-neutral-500">Your note</span>
            <span className="text-[15px] leading-snug">“{it.note}”</span>
          </div>
        ) : null}

        {proof.length ? (
          <div className="flex flex-col gap-2.5 border-t border-[#EDF0F3] pt-3.5">
            <span className="text-sm font-semibold">{it.note ? "What the AI did with it" : "How Autopilot knows"}</span>
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
          <NoteBox
            open={composer}
            onOpen={openComposer}
            text={noteText}
            setText={setNoteText}
            refEl={noteRef}
            busy={busy}
            redo={redo}
            hint={hint}
            onSend={redoWithNote}
            hasFix
          />
          <button type="button" disabled={!!busy} onClick={() => decide("reject")} className="h-11 text-sm text-neutral-500">
            {busy === "reject" ? "…" : "Dismiss"}
          </button>
        </div>
      ) : open ? (
        <div className="flex flex-col gap-1.5">
          <Link
            href={askAiHref(it.title, it.entityTable, it.entityId, it.id)}
            className="flex h-14 items-center justify-center rounded-full bg-strow-ink text-base font-semibold text-white transition active:scale-[.98]"
          >
            ✦ Ask AI to handle it
          </Link>
          <NoteBox
            open={composer}
            onOpen={openComposer}
            text={noteText}
            setText={setNoteText}
            refEl={noteRef}
            busy={busy}
            redo={redo}
            hint={hint}
            onSend={redoWithNote}
            hasFix={false}
          />
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
          {status === "undone" ? "Undone — back to how it was." : status === "resolved" ? "Closed — nothing needed changing." : "Dismissed."}
        </div>
      )}
      </div>
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
      {toast ? <UndoToast refEl={toastRef} toast={toast} onUndo={() => undoFromToast(toast)} /> : null}
    </div>
  );
}

function UndoToast({ toast, onUndo, refEl }: { toast: Toast; onUndo: () => void; refEl: RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={refEl}
      role="status"
      className="fixed inset-x-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[70] mx-auto flex max-w-[440px] items-center gap-3 rounded-full bg-strow-ink/95 py-2 pe-2 ps-5 text-white shadow-[0_12px_32px_rgba(15,28,43,0.3)] md:bottom-8"
    >
      <span className="min-w-0 flex-1 truncate text-sm">
        {toast.kind === "fixed" ? "Fixed: " : toast.kind === "closed" ? "Closed: " : "Dismissed: "}
        {toast.title}
      </span>
      {toast.kind === "closed" ? null : (
        <button type="button" onClick={onUndo} className="h-11 shrink-0 rounded-full bg-white/15 px-4 text-sm font-semibold">
          Undo
        </button>
      )}
    </div>
  );
}

/** "Tell the AI what's right": a note the AI follows when it rebuilds the fix, with its steps live while it works. */
function NoteBox({
  open,
  onOpen,
  text,
  setText,
  refEl,
  busy,
  redo,
  hint,
  onSend,
  hasFix,
}: {
  open: boolean;
  onOpen: () => void;
  text: string;
  setText: (t: string) => void;
  refEl: RefObject<HTMLTextAreaElement | null>;
  busy: string | null;
  redo: { steps: RedoStep[]; done?: string } | null;
  hint: string | null;
  onSend: () => void;
  hasFix: boolean;
}) {
  if (!open) {
    return (
      <button
        type="button"
        disabled={!!busy}
        onClick={onOpen}
        className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#D5DAE1] bg-white text-[15px] font-semibold text-strow-ink transition active:scale-[.98] disabled:opacity-50"
      >
        <PenIcon />
        {hasFix ? "Add a note before fixing" : "Tell the AI what to do"}
      </button>
    );
  }
  const working = busy === "redo";
  const filled = text.trim().length > 0;
  return (
    <div className="flex flex-col gap-2.5 rounded-3xl bg-white p-3.5">
      <label htmlFor="ny-note" className="px-1 text-sm font-semibold">
        {hasFix ? "Tell the AI what's right" : "Tell the AI what to do"}
      </label>
      <textarea
        id="ny-note"
        ref={refEl}
        value={text}
        disabled={working}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={1000}
        dir="auto"
        placeholder={hasFix ? "e.g. “Benny” is strawberry, not banana" : "e.g. Croissants cost 4.50 each from Golden Grains"}
        className="w-full resize-none rounded-2xl border border-[#E1E5EA] bg-[#F7F8FA] px-3.5 py-3 text-base leading-snug outline-none focus:border-strow-blue disabled:opacity-60"
      />
      {working && redo ? (
        <ol className="flex flex-col gap-1.5 px-1" aria-live="polite">
          {(redo.steps.length ? redo.steps : [{ text: "Reading your note" } as RedoStep]).map((s, k, all) => {
            const last = k === all.length - 1 && !redo.done;
            return (
              <li key={k} className="flex items-start gap-2 text-[13px] leading-snug">
                <span className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {last ? <span className="ai-dots scale-75" aria-hidden><i /><i /><i /></span> : <CheckIcon className="h-3.5 w-3.5" />}
                </span>
                <span className={last ? "ai-shimmer" : "text-neutral-600"}>
                  {s.text}
                  {s.note ? <span className="text-neutral-400"> · {s.note}</span> : null}
                </span>
              </li>
            );
          })}
          {redo.done ? <li className="text-[13px] font-semibold text-strow-blue">{redo.done}</li> : null}
        </ol>
      ) : null}
      {hint && !working ? <p className="px-1 text-[13px] leading-snug text-neutral-600">{hint}</p> : null}
      <button
        type="button"
        disabled={!!busy}
        onClick={onSend}
        className="h-12 rounded-full bg-strow-ink text-[15px] font-semibold text-white transition active:scale-[.98] disabled:opacity-60"
      >
        {working ? "The AI is redoing it…" : hasFix ? (filled ? "Redo the fix with my note" : "Redo the fix") : filled ? "Fix it with my note" : "Let the AI try"}
      </button>
      <p className="px-1 text-xs text-neutral-500">Nothing changes until you tap Apply on the new fix.</p>
    </div>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M13.5 6.5l3 3" />
    </svg>
  );
}
