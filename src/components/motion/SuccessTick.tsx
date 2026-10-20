"use client";

import { useRef } from "react";
import { motion, reducedMotion, useGSAP } from "@/lib/motion";

/** A green circle whose tick draws itself, with one soft ring going out. */
export function SuccessTick({ size = 88, label = "Done", className = "" }: { size?: number; label?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || reducedMotion()) return;
      const { gsap } = motion();
      gsap
        .timeline({ delay: 0.05 })
        .from(el.querySelector("[data-circle]"), { scale: 0.5, opacity: 0, duration: 0.55, ease: "back.out(1.8)" })
        .fromTo(el.querySelector("[data-ring]"), { scale: 1, opacity: 0.35 }, { scale: 1.7, opacity: 0, duration: 0.9, ease: "power2.out" }, "<0.1")
        .fromTo(el.querySelector("path"), { strokeDashoffset: 17 }, { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" }, "<");
    },
    { scope: ref },
  );
  return (
    <span ref={ref} role="img" aria-label={label} className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      <span data-ring="" className="absolute inset-0 rounded-full bg-[#0A6B34] opacity-0" />
      <span data-circle="" className="absolute inset-0 flex items-center justify-center rounded-full bg-[#0A6B34] text-white">
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6.5 12.5l3.5 3.5L17.5 8.5" strokeDasharray="17" strokeDashoffset="0" />
        </svg>
      </span>
    </span>
  );
}
