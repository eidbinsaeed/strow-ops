"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js once the page mounts. Idempotent - the browser dedupes.
 * Disabled in development to avoid stale caches while iterating.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error("[sw] register failed:", e);
      });
  }, []);

  return null;
}
