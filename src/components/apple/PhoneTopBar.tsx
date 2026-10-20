"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/dict";
import { HUB, isSectionRoot, sectionOf } from "@/lib/sections";

/**
 * Phone top row: a back pill to the section a page lives in (Money, Stock…),
 * and on the right Strow AI and the account button. The page's own large title
 * sits right under it.
 */
export function PhoneTopBar({ locale, initial = "E" }: { locale: Locale; initial?: string }) {
  const p = usePathname() ?? "";
  if (p === "/owner/assistant" || p.startsWith("/owner/finance/assistant") || p.startsWith("/owner/login")) return null;
  const ar = locale === "ar";
  const s = sectionOf(p);
  const back = !isSectionRoot(p) && s ? HUB[s] : null;
  return (
    <div className="flex items-center justify-between gap-2.5 px-4 pb-1 pt-[max(0.9rem,env(safe-area-inset-top))] md:hidden print:hidden">
      {back ? (
        <Link href={back.href as Route} className="glass press flex h-11 items-center gap-1 rounded-full pe-4 ps-2.5 text-[17px] text-strow-blue">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {ar ? back.ar : back.en}
        </Link>
      ) : (
        <span />
      )}
      <div className="flex gap-2.5">
        <Link href="/owner/assistant" aria-label="Strow AI" className="glass press flex h-11 w-11 items-center justify-center rounded-full text-strow-blue">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9z" />
            <path d="M18 13.5l.9 2.6 2.6.9-2.6.9L18 20.5l-.9-2.6-2.6-.9 2.6-.9z" />
          </svg>
        </Link>
        <Link
          href="/owner/account"
          aria-label={ar ? "الحساب والإعدادات" : "Account and settings"}
          aria-current={p === "/owner/account" ? "page" : undefined}
          className="glass press flex h-11 w-11 items-center justify-center rounded-full text-[17px] font-semibold text-strow-ink"
        >
          {initial}
        </Link>
      </div>
    </div>
  );
}
