"use client";

import { useEffect } from "react";

const STALE = /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch|Load failed|Server Components render|reading '(?:call|default)'/i;
const KEY = "strow-crash-reload";

/**
 * Shown instead of Next's blank "Application error" page.
 * - An old copy of the app after a deploy → reload once, automatically.
 * - Anything else → friendly screen with the real error text (screenshot it).
 */
export function CrashScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const msg = `${error?.name ?? "Error"}: ${error?.message ?? String(error)}`;
  const stale = STALE.test(msg);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[crash]", error);
    if (!stale) return;
    try {
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      /* private mode */
    }
  }, [error, stale]);

  const reload = () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#F7F7F5", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: "#0F1C2B", margin: 0 }}>
          {stale ? "Strow was updated — reloading…" : "Something broke on this screen"}
        </p>
        <p style={{ fontSize: 14, color: "#6B7280", margin: "8px 0 20px" }}>Your data is safe. Tap reload to continue.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={reload} style={{ background: "#0F1C2B", color: "#fff", border: 0, borderRadius: 999, padding: "12px 22px", fontSize: 15 }}>
            Reload
          </button>
          {reset && !stale ? (
            <button onClick={reset} style={{ background: "#fff", color: "#0F1C2B", border: "1px solid #D1D5DB", borderRadius: 999, padding: "12px 22px", fontSize: 15 }}>
              Try again
            </button>
          ) : null}
        </div>
        {!stale ? (
          <p style={{ marginTop: 20, fontSize: 11, color: "#9CA3AF", wordBreak: "break-word", fontFamily: "ui-monospace, monospace" }}>
            {msg.slice(0, 300)}
            {error?.digest ? ` · ${error.digest}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
