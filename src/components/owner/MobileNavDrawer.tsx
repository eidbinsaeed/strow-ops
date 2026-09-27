"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LangToggle } from "./LangToggle";
import { tr } from "@/lib/i18n/tr";
import type { Locale } from "@/lib/i18n/dict";

/** Opens the phone menu from anywhere (e.g. the "More" tab). */
export function openOwnerMenu() {
  window.dispatchEvent(new Event("strow:open-menu"));
}

function todayLabel(locale: Locale): string {
  const parts = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Dubai",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return locale === "ar" ? `${get("weekday")} ${get("day")} ${get("month")}` : `${get("weekday")}, ${get("day")} ${get("month")}`;
}

export function MobileNavDrawer({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("strow:open-menu", onOpen);
    return () => window.removeEventListener("strow:open-menu", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const isRtl = locale === "ar";
  // The chat screen has its own header.
  const hideHeader = pathname.startsWith("/owner/assistant");

  return (
    <>
      {!hideHeader ? (
        <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-[max(1.25rem,env(safe-area-inset-top))] md:hidden print:hidden">
          <Link href="/owner" className="flex min-w-0 flex-col gap-0.5">
            <span className="font-display text-xl font-bold tracking-[-0.3px]">Qave Cafe</span>
            <span className="truncate text-[13px] text-neutral-500" suppressHydrationWarning>
              {todayLabel(locale)}
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <LangToggle />
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={tr("nav.menu_open", locale)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-strow-ink font-display text-base font-semibold text-white"
            >
              E
            </button>
          </div>
        </header>
      ) : null}

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="ai-fade absolute inset-0 bg-[#0F1C2B]/40" onClick={() => setOpen(false)} />
          <aside
            className={`absolute inset-y-0 ${isRtl ? "right-0 rounded-s-[28px]" : "left-0 rounded-e-[28px]"} flex w-[300px] max-w-[85vw] flex-col overflow-y-auto bg-strow-bg pb-[env(safe-area-inset-bottom)] shadow-2xl`}
          >
            <div className="flex items-center justify-between px-6 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
              <span className="font-display text-2xl font-bold tracking-[-0.5px]">Strow</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tr("nav.menu_close", locale)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl leading-none text-strow-ink"
              >
                ×
              </button>
            </div>
            {children}
          </aside>
        </div>
      )}
    </>
  );
}
