"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useTransition } from "react";

/**
 * "Load older" under a long list (Bills, Closings): shows the next rows in
 * place. The list stays on screen while they load, and the reader stays where
 * he was: the router moves the page to the top after every change of address
 * (even when asked not to), so the place is put back before the screen is drawn.
 */
export function LoadOlder({ href, label, loadingLabel }: { href: string; label: string; loadingLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  /** Where the page was scrolled to, and on which page, when the button was tapped. */
  const place = useRef<{ top: number; path: string } | null>(null);
  const putBack = useRef(() => {
    const p = place.current;
    place.current = null;
    if (!p || window.location.pathname !== p.path) return; // the reader went to another page meanwhile
    // Once this render is on the page (the router's jump to the top included), before it is painted.
    queueMicrotask(() => window.scrollTo({ top: p.top, behavior: "instant" }));
  });

  // The older rows have arrived.
  useLayoutEffect(() => {
    if (!pending) putBack.current();
  }, [pending]);
  // The last rows arrived and this button goes away with them: put the page back all the same.
  useLayoutEffect(() => {
    const back = putBack.current;
    return () => back();
  }, []);

  return (
    <div className="mt-4 flex justify-center">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          place.current = { top: window.scrollY, path: window.location.pathname };
          start(() => router.push(href as never, { scroll: false }));
        }}
        className="min-h-11 rounded-full border border-neutral-300 bg-white px-5 text-sm font-medium text-strow-ink transition hover:bg-neutral-50 disabled:opacity-60"
      >
        {pending ? loadingLabel : label}
      </button>
    </div>
  );
}
