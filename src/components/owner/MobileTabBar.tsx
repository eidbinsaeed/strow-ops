"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/dict";
import { openOwnerMenu } from "./MobileNavDrawer";
import { BooksIcon, MoreIcon, PulseIcon, Sparkle, StaffIcon } from "@/components/pulse/icons";

const HIDE = ["/owner/finance/classic", "/owner/login"];

/** Phone navigation from the Pulse design: Pulse · Books · ✦ AI · Staff · More. */
export function MobileTabBar({ locale, aiBadge = 0 }: { locale: Locale; aiBadge?: number }) {
  const p = usePathname() ?? "";
  if (p === "/owner/assistant" || p === "/owner/finance/assistant" || HIDE.some((h) => p.startsWith(h))) return null;
  const ar = locale === "ar";
  const tab = (href: Route, label: string, icon: React.ReactNode, active: boolean) => (
    <Link
      href={href}
      className={`flex min-h-11 min-w-14 flex-col items-center justify-center gap-[3px] text-[11px] transition ${active ? "font-semibold text-strow-ink" : "text-neutral-500"}`}
    >
      {icon}
      {label}
    </Link>
  );
  const books = ["/owner/closings", "/owner/expenses", "/owner/items", "/owner/review"].some((x) => p.startsWith(x));
  const staff = ["/owner/baristas", "/owner/attendance"].some((x) => p.startsWith(x));
  return (
    <nav className="fixed inset-x-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 flex h-[68px] items-center justify-around rounded-[34px] border border-[rgba(15,28,43,0.08)] bg-white/80 px-1.5 shadow-[0_12px_32px_rgba(15,28,43,0.14)] backdrop-blur-[18px] md:hidden print:hidden">
      {tab("/owner", ar ? "النبض" : "Pulse", <PulseIcon />, p === "/owner" || p.startsWith("/owner/needs-you"))}
      {tab("/owner/closings", ar ? "الدفاتر" : "Books", <BooksIcon />, books)}
      <Link
        href="/owner/assistant"
        aria-label="Ask Autopilot"
        className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full bg-strow-blue text-white shadow-[0_8px_20px_rgba(35,80,208,0.4)] transition active:scale-95"
      >
        <Sparkle />
        {aiBadge > 0 ? (
          <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#9A1B12] px-1 text-[10px] font-semibold text-white ring-2 ring-white">
            {aiBadge > 99 ? "99+" : aiBadge}
          </span>
        ) : null}
      </Link>
      {tab("/owner/baristas", ar ? "الفريق" : "Staff", <StaffIcon />, staff)}
      <button type="button" onClick={openOwnerMenu} className="flex min-h-11 min-w-14 flex-col items-center justify-center gap-[3px] text-[11px] text-neutral-500">
        <MoreIcon />
        {ar ? "المزيد" : "More"}
      </button>
    </nav>
  );
}
