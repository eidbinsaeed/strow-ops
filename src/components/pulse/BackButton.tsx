"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { BackIcon } from "./icons";

/**
 * Goes back to the previous screen. When a page was opened directly (e.g. from
 * the home-screen app, which has no browser back gesture) it goes to `fallback`.
 */
export function BackButton({ fallback, label, className = "" }: { fallback: Route; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label ?? "Back"}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className={`flex min-h-11 items-center gap-1.5 text-[15px] text-strow-ink transition active:opacity-60 ${className}`}
    >
      <BackIcon />
      {label ? <span>{label}</span> : null}
    </button>
  );
}
