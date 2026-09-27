"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/dict";

const HIDE = ["/owner/finance", "/owner/assistant", "/owner/login"];

type Tab = { href: Route; en: string; ar: string; icon: React.ReactNode; exact?: boolean };

const I = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const LEFT: Tab[] = [
  { href: "/owner", en: "Home", ar: "الرئيسية", icon: I("M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"), exact: true },
  { href: "/owner/closings", en: "Sales", ar: "المبيعات", icon: I("M4 19V9M10 19V5M16 19v-7M22 19H2") },
];
const RIGHT: Tab[] = [
  { href: "/owner/expenses", en: "Purchases", ar: "المشتريات", icon: I("M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6") },
  { href: "/owner/items", en: "Items", ar: "الأصناف", icon: I("M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10") },
];

/** Phone-only bottom navigation with the AI in the middle. */
export function MobileTabBar({ locale, aiBadge = 0 }: { locale: Locale; aiBadge?: number }) {
  const pathname = usePathname() ?? "";
  if (HIDE.some((p) => pathname.startsWith(p))) return null;
  const item = (t: Tab) => {
    const on = t.exact ? pathname === t.href : pathname.startsWith(t.href as string);
    return (
      <Link key={t.href as string} href={t.href} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] transition ${on ? "text-strow-ink" : "text-neutral-400"}`}>
        {t.icon}
        <span className={on ? "font-medium" : ""}>{locale === "ar" ? t.ar : t.en}</span>
      </Link>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden print:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
        {LEFT.map(item)}
        <Link href="/owner/assistant" className="-mt-5 flex flex-col items-center gap-0.5 pb-2 text-[10px] text-strow-ink">
          <span className="relative">
            <span className="ai-orb flex h-14 w-14 items-center justify-center shadow-lg ring-4 ring-white" aria-hidden />
            <span className="absolute inset-0 flex items-center justify-center text-lg text-white">✦</span>
            {aiBadge > 0 ? (
              <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white ring-2 ring-white">
                {aiBadge > 99 ? "99+" : aiBadge}
              </span>
            ) : null}
          </span>
          <span className="font-medium">AI</span>
        </Link>
        {RIGHT.map(item)}
      </div>
    </nav>
  );
}
