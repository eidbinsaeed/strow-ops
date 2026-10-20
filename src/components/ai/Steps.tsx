"use client";

/**
 * What Strow AI is doing, step by step. While it works the steps tick in one
 * by one (each slides open, the current one shimmers); when the answer is in,
 * the list folds into one line — "How I got this · 4 steps · 12 s" — that
 * opens again on tap.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { Step } from "@/lib/ai/types";
import { useLocale } from "@/components/owner/LocaleProvider";
import { gsap, motion, reducedMotion } from "@/lib/motion";

motion();

function Tick({ ok = true }: { ok?: boolean }) {
  return ok ? (
    <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#008932] text-white">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  ) : (
    <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#C55300] text-[12px] font-bold leading-none text-white">!</span>
  );
}

function Spinner() {
  return <span aria-hidden className="block h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-[#1E6EF4] border-t-transparent motion-reduce:animate-none" />;
}

export function Steps({ items, live, seconds = 0, thinking }: { items: Step[]; live: boolean; seconds?: number; thinking: string }) {
  const ar = useLocale() === "ar";
  const [open, setOpen] = useState(live);
  const listRef = useRef<HTMLOListElement>(null);
  const count = useRef(items.length);
  const wasLive = useRef(live);

  // A new step slides open.
  useLayoutEffect(() => {
    const list = listRef.current;
    const grew = items.length > count.current;
    count.current = items.length;
    if (!list || !grew || !live || reducedMotion()) return;
    const target = list.children[items.length - 1] as HTMLElement | undefined;
    if (target) gsap.fromTo(target, { height: 0, opacity: 0, y: 6 }, { height: "auto", opacity: 1, y: 0, duration: 0.35, ease: "power3.out", clearProps: "height,transform,opacity" });
  }, [items.length, live]);

  // The answer is in: fold the list away.
  useLayoutEffect(() => {
    if (wasLive.current && !live) {
      const list = listRef.current;
      if (list && !reducedMotion()) {
        gsap.to(list, { height: 0, opacity: 0, duration: 0.4, ease: "power2.inOut", onComplete: () => setOpen(false) });
      } else setOpen(false);
    }
    wasLive.current = live;
  }, [live]);

  const toggle = () => {
    if (live) return;
    const list = listRef.current;
    if (open && list && !reducedMotion()) {
      gsap.to(list, { height: 0, opacity: 0, duration: 0.3, ease: "power2.inOut", onComplete: () => setOpen(false) });
      return;
    }
    setOpen((o) => !o);
  };

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || live || !list || reducedMotion()) return;
    gsap.fromTo(list, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.35, ease: "power3.out", clearProps: "height,opacity" });
  }, [open, live]);

  if (!live && !items.length) return null;
  const n = items.length;
  const lastDone = !!items[n - 1]?.note;

  return (
    <div className="text-[14px]">
      {!live ? (
        <button type="button" onClick={toggle} aria-expanded={open} className="flex min-h-9 items-center gap-2 rounded-full text-neutral-500">
          <Tick />
          <span>
            {ar ? `كيف وصلت للإجابة · ${n} ${n === 1 ? "خطوة" : "خطوات"}` : `How I got this · ${n} step${n === 1 ? "" : "s"}`}
            {seconds >= 2 ? ` · ${seconds} ${ar ? "ث" : "s"}` : ""}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      ) : null}
      {open ? (
        <ol ref={listRef} className={`flex flex-col overflow-hidden ${live ? "" : "mt-1 border-s-2 border-[#E5E5EA] ps-3"}`} aria-live={live ? "polite" : undefined}>
          {items.map((s, i) => {
            const current = live && i === n - 1 && !s.note;
            return (
              <li key={i} data-step="" className="flex items-start gap-2.5 py-1">
                {current ? <Spinner /> : <Tick ok={s.ok !== false} />}
                <span className="min-w-0 flex-1 leading-[18px]">
                  <span className={current ? "ai-shimmer" : "text-neutral-700"}>{s.text}</span>
                  {s.note ? <span className="text-neutral-400"> · {s.note}</span> : null}
                  {current && seconds >= 3 ? <span className="ms-1.5 text-xs tabular-nums text-neutral-400">{seconds}s</span> : null}
                </span>
              </li>
            );
          })}
          {live && (n === 0 || lastDone) ? (
            <li data-step="" className="flex items-center gap-2.5 py-1">
              <Spinner />
              <span className="ai-shimmer">{thinking}</span>
              {seconds >= 3 ? <span className="text-xs tabular-nums text-neutral-400">{seconds}s</span> : null}
            </li>
          ) : null}
        </ol>
      ) : null}
    </div>
  );
}
