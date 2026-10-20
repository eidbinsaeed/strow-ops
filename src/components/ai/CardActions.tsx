"use client";

/**
 * The two buttons on a chart or table in the chat: open it full screen, and
 * pin it to Home. Full screen grows out of the card (clip-path, so nothing
 * stretches) and shrinks back into it. A pin sends a small "Pinned to Home"
 * pill flying to the Home tab.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ChartBlock, TableBlock } from "@/lib/ai/types";
import { useLocale } from "@/components/owner/LocaleProvider";
import { gsap, motion, reducedMotion } from "@/lib/motion";
import { useChatTools } from "./ChatTools";

motion();

const btn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition active:scale-90 hover:bg-neutral-100";

export function ExpandButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={btn}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 4h6v6 M20 4l-7 7 M10 20H4v-6 M4 20l7-7" />
      </svg>
    </button>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 3h6l-1 6 4 4H6l4-4z M12 13v8" />
    </svg>
  );
}

function fly(from: HTMLElement, text: string) {
  const r = from.getBoundingClientRect();
  const pill = document.createElement("div");
  pill.textContent = text;
  pill.setAttribute("role", "status");
  Object.assign(pill.style, {
    position: "fixed",
    left: `${r.left + r.width / 2}px`,
    top: `${r.top}px`,
    transform: "translate(-50%, -100%)",
    zIndex: "80",
    background: "#1C1C1E",
    color: "#fff",
    font: "600 13px/1 -apple-system, system-ui, sans-serif",
    padding: "9px 13px",
    borderRadius: "999px",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    boxShadow: "0 8px 24px rgba(0,0,0,.18)",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(pill);
  // Keep the pill on screen when the button sits near an edge.
  const half = pill.offsetWidth / 2;
  const cx = Math.min(Math.max(r.left + r.width / 2, half + 12), window.innerWidth - half - 12);
  pill.style.left = `${cx}px`;
  const done = () => pill.remove();
  if (reducedMotion()) {
    setTimeout(done, 1600);
    return;
  }
  const tab = document.querySelector<HTMLElement>("[data-tab-home]");
  const t = tab?.getBoundingClientRect();
  const tl = gsap.timeline({ onComplete: done });
  tl.fromTo(pill, { opacity: 0, y: 8, scale: 0.9 }, { opacity: 1, y: -6, scale: 1, duration: 0.3, ease: "back.out(2)" });
  if (t && t.width > 0) {
    tl.to(pill, { left: t.left + t.width / 2, top: t.top + 8, scale: 0.3, opacity: 0.2, duration: 0.6, ease: "power2.in", delay: 0.5 });
    tl.add(() => {
      gsap.fromTo(tab, { scale: 1 }, { scale: 1.18, duration: 0.16, yoyo: true, repeat: 1, ease: "power2.out", clearProps: "transform" });
    });
  } else {
    tl.to(pill, { y: -40, opacity: 0, duration: 0.5, ease: "power2.in", delay: 1.2 });
  }
}

export function PinButton({ block }: { block: ChartBlock | TableBlock }) {
  const { canPin, chatId } = useChatTools();
  const ar = useLocale() === "ar";
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const ref = useRef<HTMLButtonElement>(null);
  if (!canPin) return null;
  const label = state === "done" ? (ar ? "مثبّت في الرئيسية" : "Pinned to Home") : ar ? "ثبّت في الرئيسية" : "Pin to Home";
  const pin = async () => {
    if (state === "busy" || state === "done") return;
    setState("busy");
    try {
      const r = await fetch("/api/ai/pins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ block, chatId }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; live?: boolean };
      if (!r.ok || !j.ok) throw new Error();
      setState("done");
      if (ref.current) fly(ref.current, j.live ? (ar ? "ثُبّت في الرئيسية · يتحدّث تلقائياً" : "Pinned to Home · stays up to date") : ar ? "ثُبّت في الرئيسية" : "Pinned to Home");
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  };
  return (
    <button
      ref={ref}
      type="button"
      onClick={pin}
      aria-label={label}
      title={label}
      aria-pressed={state === "done"}
      className={`${btn} ${state === "done" ? "text-strow-blue" : state === "error" ? "text-strow-amber" : ""} ${state === "busy" ? "animate-pulse" : ""}`}
    >
      <PinIcon filled={state === "done"} />
    </button>
  );
}

/** Full screen view that grows out of `origin` (the card) and shrinks back into it. */
export function FullScreen({ origin, title, onClose, actions, children }: { origin: HTMLElement | null; title: string; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const ar = useLocale() === "ar";

  const clipFor = (el: HTMLElement | null) => {
    if (!el) return "inset(0px 0px 0px 0px round 0px)";
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return `inset(${Math.max(0, r.top)}px ${Math.max(0, vw - r.right)}px ${Math.max(0, vh - r.bottom)}px ${Math.max(0, r.left)}px round 16px)`;
  };

  useLayoutEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    if (panel.current && !reducedMotion()) {
      gsap.fromTo(panel.current, { clipPath: clipFor(origin) }, { clipPath: "inset(0px 0px 0px 0px round 0px)", duration: 0.45, ease: "power3.inOut", clearProps: "clipPath" });
      if (body.current) gsap.fromTo(body.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, delay: 0.18, ease: "power2.out", clearProps: "transform,opacity" });
    }
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (!panel.current || reducedMotion()) return onClose();
    gsap.to(body.current, { opacity: 0, duration: 0.15 });
    gsap.to(panel.current, { clipPath: clipFor(origin), duration: 0.38, ease: "power3.inOut", onComplete: onClose });
  };

  const host = typeof document !== "undefined" ? (document.getElementById("strow-portal") ?? document.body) : null;
  if (!host) return null;
  return createPortal(
    <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex flex-col bg-[#F2F2F7]">
      <div className="flex items-center gap-2 border-b border-[#E5E5EA] bg-white/90 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <button type="button" onClick={close} aria-label={ar ? "إغلاق" : "Close"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-strow-ink active:bg-neutral-100">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title}</h2>
        {actions}
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-auto px-3 py-4 md:px-8">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </div>
    </div>,
    host,
  );
}
