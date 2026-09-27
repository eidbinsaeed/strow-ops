"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Runs a full Autopilot check on demand and refreshes the page when done. */
export function RunAutopilotButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = window.setInterval(() => setSecs(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  async function run() {
    setBusy(true);
    setMsg(null);
    setSecs(0);
    try {
      const r = await fetch("/api/ai/autopilot", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { summary?: string; error?: string; applied?: number; proposed?: number; flagged?: number };
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg(j.summary ?? "Done.");
      router.refresh();
    } catch (e) {
      setMsg("⚠️ " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-sm text-neutral-700 transition active:scale-[.97] disabled:opacity-70"
      >
        {busy ? (
          <>
            <span className="ai-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Checking… {secs}s
          </>
        ) : (
          "Run check now"
        )}
      </button>
      {msg ? <p className="mt-2 text-xs leading-relaxed text-neutral-500">{msg}</p> : null}
    </div>
  );
}
