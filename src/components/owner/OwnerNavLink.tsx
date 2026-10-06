"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

/**
 * Sidebar link. Active on its own page and pages under it, unless `exact`;
 * `also` lists other paths that count as this page (e.g. a tab inside it).
 */
export function OwnerNavLink({
  href,
  children,
  badge,
  exact = false,
  also = [],
}: {
  href: Route;
  children: React.ReactNode;
  badge?: number | null;
  exact?: boolean;
  also?: string[];
}) {
  const pathname = usePathname() ?? "";
  const h = href as string;
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  const active = pathname === h || (!exact && h !== "/owner" && under(h)) || also.some(under);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center justify-between gap-2 rounded-[14px] px-3 text-[15px] transition ${
        active ? "bg-strow-ink font-semibold text-white" : "text-strow-ink hover:bg-white/70"
      }`}
    >
      <span className="truncate">{children}</span>
      {badge ? <span className={`shrink-0 text-xs font-semibold ${active ? "text-white/80" : "text-[#9A1B12]"}`}>{badge}</span> : null}
    </Link>
  );
}
