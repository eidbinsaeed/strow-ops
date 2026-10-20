"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Flip as FlipPlugin } from "gsap/Flip";
import { motion, reducedMotion } from "@/lib/motion";

type FlipState = ReturnType<typeof FlipPlugin.getState>;
type Snap = { state: FlipState; top: number; ids: string[] };

/**
 * A list whose rows glide to their new places when the list changes — a
 * filter, a search, a sort, or new rows arriving from a live refresh.
 * Rows that stay slide (GSAP Flip); new rows fade and rise in; removed rows
 * just go. Give every direct child a stable `data-flip-id`.
 *
 * The positions from the last render are kept and reused, so it works when
 * the new rows come from the server (router.push / router.refresh). If the
 * page scrolled in between, new rows only fade in.
 */
export function FlipList({
  className,
  children,
  enterFrom = "below",
}: {
  className?: string;
  children: ReactNode;
  /** Where new rows come from: "above" for newest-first feeds. */
  enterFrom?: "above" | "below";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<Snap | null>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const { gsap, Flip } = motion();
    const rows = Array.from(box.children).filter((c): c is HTMLElement => c instanceof HTMLElement && !!c.dataset.flipId);
    const ids = rows.map((r) => r.dataset.flipId as string);
    const prev = last.current;
    const changed = !!prev && (prev.ids.length !== ids.length || prev.ids.some((id, k) => id !== ids[k]));
    // Record where the rows sit once they are at rest, for the next change.
    const snap = () => {
      if (!ref.current) return;
      last.current = { state: Flip.getState(rows), top: box.getBoundingClientRect().top, ids };
    };

    if (!changed || !prev || reducedMotion()) {
      snap();
      return;
    }
    const fresh = rows.filter((r) => !prev.ids.includes(r.dataset.flipId as string));
    const dy = enterFrom === "above" ? -14 : 14;
    const enter = (els: Element[] | Element) =>
      gsap.fromTo(els, { opacity: 0, y: dy, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, delay: 0.1, stagger: 0.03, ease: "power3.out", clearProps: "transform,opacity" });

    if (Math.abs(prev.top - box.getBoundingClientRect().top) < 2) {
      const tl = Flip.from(prev.state, {
        targets: rows,
        duration: 0.5,
        ease: "power2.inOut",
        stagger: 0.01,
        prune: true,
        onEnter: (els) => enter(els),
        onComplete: snap,
      });
      return () => {
        tl.progress(1);
      };
    }
    if (fresh.length) enter(fresh).eventCallback("onComplete", snap);
    else snap();
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
