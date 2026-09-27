"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

export function OwnerNavLink({ href, children, badge }: { href: Route; children: React.ReactNode; badge?: number | null }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/owner" && pathname?.startsWith(href as string));
  return (
    <Link
      href={href}
      className={`flex min-h-11 items-center justify-between gap-2 rounded-[14px] px-3 text-[15px] transition ${
        active ? "bg-strow-ink font-semibold text-white" : "text-strow-ink hover:bg-white/70"
      }`}
    >
      <span className="truncate">{children}</span>
      {badge ? <span className={`shrink-0 text-xs font-semibold ${active ? "text-white/80" : "text-[#9A1B12]"}`}>{badge}</span> : null}
    </Link>
  );
}
