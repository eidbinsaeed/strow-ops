"use client";

import { usePathname } from "next/navigation";

/**
 * Applies the Pulse design (fonts, navy/grey palette, card style) to every
 * owner page except Personal Finance, which keeps its own look untouched.
 */
export function ThemeScope({ children, className = "", ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const pathname = usePathname() ?? "";
  const on = !pathname.startsWith("/owner/finance/classic");
  return (
    <div {...rest} className={`${on ? "pulse-theme " : ""}${className}`}>
      {children}
      <div id="strow-portal" />
    </div>
  );
}
