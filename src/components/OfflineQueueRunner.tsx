"use client";

import { useEffect } from "react";
import { drainQueue } from "@/lib/offline/queue";

/**
 * Runs the offline queue drainer in the background:
 *   - On mount (page load)
 *   - When the network reports it's back online
 *   - When the page becomes visible again
 *
 * Drains are best-effort and silent. If a 5xx happens we stop early and
 * try again next time. Successful items are removed from IndexedDB.
 *
 * This component renders nothing - mount it once at the app root.
 */
export function OfflineQueueRunner() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let running = false;
    async function tryDrain() {
      if (running) return;
      if (!navigator.onLine) return;
      running = true;
      try {
        await drainQueue();
      } catch {
        // ignore
      } finally {
        running = false;
      }
    }

    void tryDrain();

    const onOnline = () => void tryDrain();
    const onVis = () => {
      if (document.visibilityState === "visible") void tryDrain();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
