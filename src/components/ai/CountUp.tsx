"use client";

import { useEffect, useState } from "react";

/**
 * Animates the number inside a formatted string ("AED 11,368.00", "48 days")
 * from a fraction of its value up to the value. Server-rendered text stays
 * correct; the animation only runs in the browser.
 */
export function CountUpText({ text, from = 0, duration = 900 }: { text: string; from?: number; duration?: number }) {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    setShown(text);
    const m = /^(.*?)(-?[\d,]+(?:\.\d+)?)(.*)$/s.exec(text);
    if (!m) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const [, pre, numStr, post] = m;
    const target = parseFloat(numStr.replace(/,/g, ""));
    if (!Number.isFinite(target) || Math.abs(target) < 2) return;
    const decimals = (numStr.split(".")[1] ?? "").length;
    const comma = numStr.includes(",") || Math.abs(target) >= 1000;
    const start = target * from;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = start + (target - start) * eased;
      const s = comma
        ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : v.toFixed(decimals);
      setShown(p < 1 ? pre + s + post : text);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, from, duration]);

  return <span className="tabular-nums">{shown}</span>;
}
