"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@supabase/supabase-js";
import { BooksIcon, CameraIcon, Sparkle } from "@/components/pulse/icons";

type LiveEvent = { key: string; kind: "closing" | "expense" | "ai"; title: string; subtitle: string; href: string };

// Screens where a surprise refresh would get in the way (typing, reviewing one by one) or that we never touch.
const NO_REFRESH = ["/owner/assistant", "/owner/needs-you", "/owner/finance"];

/**
 * Keeps every owner screen current without closing the app:
 *  - instant: Supabase Realtime broadcast when a barista submits or Autopilot finishes
 *  - on return: re-checks the moment the app comes back to the foreground
 *  - fallback: a cheap check every 20 s while the screen is visible
 * New closings, bills and Autopilot findings also pop up as banners.
 */
export function LiveUpdates() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const pathRef = useRef(pathname);
  const sigRef = useRef<string | null>(null);
  const sinceRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const againRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());
  const [toasts, setToasts] = useState<LiveEvent[]>([]);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const check = useCallback(async () => {
    if (busyRef.current) {
      againRef.current = true;
      return;
    }
    busyRef.current = true;
    try {
      const qs = sinceRef.current ? `?since=${encodeURIComponent(sinceRef.current)}` : "";
      const r = await fetch(`/api/live${qs}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { now?: string; sig?: string; events?: LiveEvent[] };
      const changed = sigRef.current !== null && !!j.sig && j.sig !== sigRef.current;
      if (j.sig) sigRef.current = j.sig;
      if (j.now) sinceRef.current = j.now;
      const p = pathRef.current;
      const fresh = (j.events ?? []).filter((e) => !seenRef.current.has(e.key));
      fresh.forEach((e) => seenRef.current.add(e.key));
      if (fresh.length && !p.startsWith("/owner/finance")) setToasts((t) => [...fresh, ...t].slice(0, 3));
      if (changed && !NO_REFRESH.some((x) => p.startsWith(x))) router.refresh();
    } catch {
      /* offline — the next check catches up */
    } finally {
      busyRef.current = false;
      if (againRef.current) {
        againRef.current = false;
        void check();
      }
    }
  }, [router]);

  // First check, every 20 s while visible, and whenever the app comes back to the front.
  useEffect(() => {
    void check();
    const iv = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 20_000);
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("online", onShow);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("online", onShow);
    };
  }, [check]);

  // Instant: a barista submit / Autopilot run broadcasts on "strow-live".
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    let timer: number | undefined;
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const channel = sb
      .channel("strow-live")
      .on("broadcast", { event: "change" }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void check(), 600);
      })
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [check]);

  // Each banner stays ~7 s.
  useEffect(() => {
    if (!toasts.length) return;
    const id = window.setTimeout(() => setToasts((t) => t.slice(0, -1)), 7000);
    return () => window.clearTimeout(id);
  }, [toasts]);

  if (!toasts.length) return null;
  const dismiss = (key: string) => setToasts((x) => x.filter((y) => y.key !== key));
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[75] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] print:hidden">
      {toasts.map((t) => (
        <div
          key={t.key}
          className="ai-pop pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl bg-white p-2.5 shadow-[0_12px_32px_rgba(15,28,43,0.18)] ring-1 ring-black/5"
        >
          <button
            type="button"
            onClick={() => {
              dismiss(t.key);
              router.push(t.href as Route);
            }}
            className="flex min-w-0 flex-1 items-center gap-3 text-start"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${t.kind === "ai" ? "bg-strow-blue" : "bg-strow-ink"}`}>
              {t.kind === "ai" ? <Sparkle className="h-5 w-5" /> : t.kind === "closing" ? <CameraIcon className="h-5 w-5" /> : <BooksIcon className="h-5 w-5" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-strow-ink">{t.title}</span>
              <span className="block truncate text-[13px] text-neutral-500">{t.subtitle}</span>
            </span>
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.key)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-neutral-400">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
