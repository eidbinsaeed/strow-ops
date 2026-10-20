"use client";

import { useRef, type ReactNode } from "react";
import { motion, reducedMotion, useGSAP } from "@/lib/motion";

/**
 * Brings a screen in piece by piece on first load: every descendant marked
 * `data-reveal` rises and fades in, in page order. Runs once per visit, not on
 * live refreshes. The markup is already in its final place, so with Reduce
 * motion on (or if script is slow) the screen simply shows.
 */
export function Reveal({ className, children, step = 0.06 }: { className?: string; children: ReactNode; step?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (reducedMotion() || !ref.current) return;
      const { gsap } = motion();
      const els = ref.current.querySelectorAll("[data-reveal]");
      if (!els.length) return;
      gsap.from(els, { y: 18, opacity: 0, scale: 0.985, duration: 0.55, ease: "power3.out", stagger: step, clearProps: "transform,opacity" });
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
