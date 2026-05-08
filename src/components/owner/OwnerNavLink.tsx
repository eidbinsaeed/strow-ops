"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

type NavLinkProps = {
  href: Route;
  children: React.ReactNode;
};

export function OwnerNavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  const active =
    pathname === href ||
    (href !== "/owner" && pathname?.startsWith(href as string));

  return (
    <Link
      href={href}
      className={`block rounded-md px-3 py-2 text-sm transition ${
        active
          ? "bg-strow-ink text-white"
          : "text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      {children}
    </Link>
  );
}
