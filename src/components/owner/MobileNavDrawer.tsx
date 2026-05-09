"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

/**
 * Mobile-only top bar + slide-in drawer.
 *
 * - Drawer is hidden on md+ (desktop sidebar takes over).
 * - Top bar shows on mobile only with a hamburger button.
 * - Tapping a nav link inside the drawer auto-closes it (we listen for
 *   navigation via pathname change).
 * - Backdrop click and Escape key both close.
 */
export function MobileNavDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer whenever the route changes (link tapped)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while open + close on Escape
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

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
        <Link href="/owner" className="text-base font-medium">
          Strow Ops
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 text-neutral-700 hover:bg-neutral-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
      </div>

      {/* Backdrop + drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <span className="text-base font-medium">Strow Ops</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
            {children}
          </aside>
        </div>
      )}
    </>
  );
}
