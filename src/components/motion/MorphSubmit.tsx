"use client";

import { useLayoutEffect, useRef } from "react";
import { motion, reducedMotion } from "@/lib/motion";

/**
 * A full-width submit button that shrinks into a round spinner while the form
 * is sending, and opens back up if the send fails. With Reduce motion on it
 * just shows the "sending" label.
 */
export function MorphSubmit({
  pending,
  label,
  pendingLabel = "Sending…",
  className = "",
}: {
  pending: boolean;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!pending || !el || reducedMotion()) return;
    const { gsap } = motion();
    const h = el.offsetHeight;
    const tl = gsap
      .timeline()
      .to(el.querySelector("[data-label]"), { opacity: 0, duration: 0.15 })
      .to(el, { width: h, borderRadius: h / 2, paddingLeft: 0, paddingRight: 0, duration: 0.42, ease: "power3.inOut" }, "<0.05")
      .to(el.querySelector("[data-spin]"), { opacity: 1, duration: 0.2 }, "-=0.12");
    return () => {
      tl.revert();
    };
  }, [pending]);

  return (
    <div className="flex justify-center">
      <button
        ref={ref}
        type="submit"
        disabled={pending}
        aria-busy={pending}
        aria-label={pending ? pendingLabel : undefined}
        className={`relative overflow-hidden whitespace-nowrap ${className}`}
      >
        <span data-label="">{pending ? pendingLabel : label}</span>
        <span data-spin="" aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0">
          <svg viewBox="0 0 24 24" className="h-6 w-6 animate-spin" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
            <path d="M12 3a9 9 0 1 1-9 9" />
          </svg>
        </span>
      </button>
    </div>
  );
}
