"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/dict";
import { HUB, sectionOf, type Section } from "@/lib/sections";

const HIDE = ["/owner/assistant", "/owner/finance/assistant", "/owner/finance/classic", "/owner/login"];

const TAB_ICON: Record<Exclude<Section, "account">, React.ReactNode> = {
  today: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.1 2.7a1.4 1.4 0 0 1 1.8 0l8.3 7a1 1 0 0 1-1.3 1.6l-.4-.3v8.6a2 2 0 0 1-2 2h-3v-6.1h-5v6.1h-3a2 2 0 0 1-2-2V11l-.4.3a1 1 0 0 1-1.3-1.6z" />
    </svg>
  ),
  money: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5zm9 7.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" fillRule="evenodd" />
    </svg>
  ),
  stock: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.4 20.3 6.7 12 11 3.7 6.7z" opacity="0.55" />
      <path d="M3.4 8 11.3 12.2V21.6L3.4 17.4z" />
      <path d="M20.6 8 12.7 12.2V21.6L20.6 17.4z" />
    </svg>
  ),
  team: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="7.5" r="3.6" />
      <path d="M2.4 20c0-3.7 2.9-6.3 6.6-6.3s6.6 2.6 6.6 6.3v.5H2.4z" />
      <circle cx="17.2" cy="8.6" r="2.8" opacity="0.6" />
      <path d="M16.6 13.5c3 .1 5 2.3 5 5.4v.6h-4.6c0-2.4-.8-4.5-2.4-5.7.6-.2 1.3-.3 2-.3z" opacity="0.6" />
    </svg>
  ),
};

/** Phone navigation, iOS style: Home · Money · Stock · Team in a glass pill, and Search on its own. */
export function TabBar({ locale, badge = 0 }: { locale: Locale; badge?: number }) {
  const p = usePathname() ?? "";
  if (HIDE.some((h) => p === h || p.startsWith(`${h}/`))) return null;
  const ar = locale === "ar";
  const here = p === "/owner/search" ? null : sectionOf(p);
  const tabs: Exclude<Section, "account">[] = ["today", "money", "stock", "team"];
  return (
    <nav aria-label={ar ? "الأقسام" : "Sections"} className="fixed inset-x-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 flex h-[62px] gap-2.5 md:hidden print:hidden">
      <div className="glass-bar grid h-[62px] flex-1 grid-cols-4 rounded-[31px] p-1">
        {tabs.map((t) => {
          const on = here === t;
          return (
            <Link
              key={t}
              href={HUB[t].href as Route}
              aria-current={on ? "page" : undefined}
              data-tab-home={t === "today" ? "" : undefined}
              className={`relative flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[26px] text-[11px] font-semibold transition-colors ${on ? "bg-black/[0.06] text-strow-blue" : "text-neutral-900"}`}
            >
              {TAB_ICON[t]}
              {ar ? HUB[t].ar : HUB[t].en}
              {t === "today" && badge > 0 ? (
                <span className="absolute start-1/2 top-[3px] ms-[5px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E9152D] px-[5px] text-[11px] font-bold leading-none text-white">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
      <Link
        href="/owner/search"
        aria-label={ar ? "ابحث في كل الصفحات" : "Search every page"}
        aria-current={p === "/owner/search" ? "page" : undefined}
        className={`glass-bar flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full ${p === "/owner/search" ? "text-strow-blue" : "text-neutral-900"}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 20.5 20.5" />
        </svg>
      </Link>
    </nav>
  );
}
