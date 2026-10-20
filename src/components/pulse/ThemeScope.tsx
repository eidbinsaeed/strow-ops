"use client";

import { usePathname } from "next/navigation";

/**
 * Applies the owner design to every page except the classic Personal Finance
 * page: the Pulse structure (pulse-theme) in the Apple look (apple-theme).
 */
export function ThemeScope({ children, className = "", ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const pathname = usePathname() ?? "";
  const on = !pathname.startsWith("/owner/finance/classic");
  return (
    <div {...rest} className={`${on ? "pulse-theme apple-theme " : ""}${className}`}>
      {children}
      <div id="strow-portal" />
    </div>
  );
}
