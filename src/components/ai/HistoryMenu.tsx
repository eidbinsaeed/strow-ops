"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Chat = { id: string; title: string | null; updated_at: string };

function niceTitle(t: string | null): string {
  if (!t) return "Chat";
  return t.replace(/^\[مالية\]\s*/, "").replace(/^Look into this and fix it if you can:\s*"?/i, "Fix: ").replace(/"\s*$/, "").trim() || "Chat";
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** Chat history with one-tap delete (tap the bin, then "Delete" to confirm). */
export function HistoryMenu({ chats, currentId, basePath = "/owner/assistant" }: { chats: Chat[]; currentId: string | null; basePath?: string }) {
  const router = useRouter();
  const [list, setList] = useState(chats);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function remove(id: string) {
    if (confirm !== id) {
      setConfirm(id);
      window.setTimeout(() => setConfirm((c) => (c === id ? null : c)), 3000);
      return;
    }
    setBusy(id);
    setErr(null);
    try {
      const r = await fetch(`/api/ai/chat?c=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "Could not delete that chat");
      setList((l) => l.filter((c) => c.id !== id));
      setConfirm(null);
      if (id === currentId) router.replace(`${basePath}?new=1` as Route);
      else router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!list.length) return null;
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 [&::-webkit-details-marker]:hidden">
        History
      </summary>
      <div className="absolute end-0 z-30 mt-2 max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl">
        {list.map((c) => (
          <div key={c.id} className={`flex items-center gap-1 rounded-xl ${c.id === currentId ? "bg-neutral-100" : ""}`}>
            <Link href={`${basePath}?c=${c.id}` as Route} className="min-w-0 flex-1 px-3 py-2">
              <span className={`block truncate text-sm ${c.id === currentId ? "font-semibold text-strow-ink" : "text-neutral-800"}`}>{niceTitle(c.title)}</span>
              <span className="block text-[11px] text-neutral-400">{ago(c.updated_at)}</span>
            </Link>
            <button
              type="button"
              onClick={() => remove(c.id)}
              disabled={busy === c.id}
              aria-label="Delete chat"
              className={`me-1 flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-2.5 text-xs font-semibold transition ${
                confirm === c.id ? "bg-red-600 text-white" : "text-neutral-400 hover:bg-neutral-100"
              }`}
            >
              {busy === c.id ? (
                "…"
              ) : confirm === c.id ? (
                "Delete"
              ) : (
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
                </svg>
              )}
            </button>
          </div>
        ))}
        {err ? <p className="px-3 py-2 text-xs text-red-600">{err}</p> : null}
      </div>
    </details>
  );
}
