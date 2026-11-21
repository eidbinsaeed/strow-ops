"use client";

/**
 * "AI working · 2 of 7" — a small pill on every owner page while Strow AI is
 * working in the background (a chat answer, or the Needs-you list it was
 * handed), and "AI finished · …" for a few seconds when it is done. Tap it to
 * watch the run. The chat and Needs you show the same thing in full, so the
 * pill stays off those pages.
 */
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/dict";
import { countsLine } from "@/lib/ai/job-types";
import { useAiJobs } from "./useAiJobs";

const HIDE = ["/owner/finance", "/owner/login", "/owner/needs-you"];
const SHOW_DONE_MS = 12_000;

type Done = { key: string; text: string; href: string };

/** The pill is an extra: if it ever fails to draw, the page under it must not notice. */
class Quiet extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    // eslint-disable-next-line no-console
    console.error("[ai pill]", e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function AiJobsPill({ locale }: { locale: Locale }) {
  return (
    <Quiet>
      <Pill locale={locale} />
    </Quiet>
  );
}

function Pill({ locale }: { locale: Locale }) {
  const s = useAiJobs();
  const pathname = usePathname() ?? "";
  const ar = locale === "ar";
  const [done, setDone] = useState<Done | null>(null);
  const before = useRef<{ batch: string | null; chat: { id: string; chatId: string | null } | null }>({ batch: null, chat: null });

  // Something that was running here a moment ago has ended: say so once.
  useEffect(() => {
    if (!s) return;
    const batch = s.batch?.id ?? null;
    const chat = s.running.find((r) => r.kind === "chat") ?? null;
    const was = before.current;
    if (was.batch && !batch && s.lastBatch?.id === was.batch) {
      const lb = s.lastBatch;
      const left = lb.counts.needsYou + lb.counts.failed;
      setDone({
        key: lb.id,
        text: `${lb.counts.canceled ? (ar ? "توقف الذكاء الاصطناعي" : "AI stopped") : ar ? "انتهى الذكاء الاصطناعي" : "AI finished"} · ${countsLine(lb.counts, ar)}`,
        href: left || !lb.chatId ? "/owner/needs-you" : `/owner/assistant?c=${lb.chatId}`,
      });
    } else if (was.chat && !batch && !s.running.some((r) => r.id === was.chat?.id)) {
      setDone({ key: was.chat.id, text: ar ? "إجابتك جاهزة" : "Your answer is ready", href: was.chat.chatId ? `/owner/assistant?c=${was.chat.chatId}` : "/owner/assistant" });
    }
    before.current = { batch, chat: chat ? { id: chat.id, chatId: chat.chatId } : null };
  }, [s, ar]);

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(null), SHOW_DONE_MS);
    return () => window.clearTimeout(id);
  }, [done]);

  if (pathname === "/owner/assistant" || HIDE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const item = s?.running.find((r) => r.kind === "item") ?? null;
  const chat = s?.running.find((r) => r.kind === "chat") ?? null;
  const batch = s?.batch ?? null;
  const waiting = s?.queued.length ?? 0;
  const clean = (t: string | null | undefined) => (t ?? "").replace(/^Fix:\s*/i, "").trim();

  let label = "";
  let sub = "";
  let href = "/owner/assistant";
  if (batch) {
    const n = Math.min(batch.total, batch.done + 1);
    label = ar ? `الذكاء الاصطناعي يعمل · ${n} من ${batch.total}` : `AI working · ${n} of ${batch.total}`;
    sub = item ? item.statusText || clean(item.title) : "";
    if (batch.chatId) href = `/owner/assistant?c=${batch.chatId}`;
  } else if (chat) {
    label = ar ? "الذكاء الاصطناعي يجيب" : "AI is answering";
    sub = chat.statusText && !/^(Thinking|أفكر)$/.test(chat.statusText) ? chat.statusText : "";
    if (chat.chatId) href = `/owner/assistant?c=${chat.chatId}`;
  } else if (item || waiting) {
    label = ar ? "الذكاء الاصطناعي يعمل" : "AI working";
    sub = item ? item.statusText || clean(item.title) : "";
    const cid = item?.chatId ?? s?.queued[0]?.chatId;
    if (cid) href = `/owner/assistant?c=${cid}`;
  }

  const working = !!label;
  if (!working && !done) return null;
  const text = working ? label : (done as Done).text;
  const to = working ? href : (done as Done).href;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[45] flex justify-center px-4 md:bottom-6 md:justify-start print:hidden">
      {/* Desktop: sits just past the sidebar (248 px), on whichever side the sidebar is. Phone: centred above the tab bar. */}
      <span aria-hidden className="hidden w-[248px] shrink-0 md:block" />
      <Link
        href={to as Route}
        role="status"
        aria-live="polite"
        onClick={() => setDone(null)}
        className="ai-pop pointer-events-auto flex min-h-11 max-w-full items-center gap-2.5 rounded-full bg-strow-ink py-1.5 pe-4 ps-2 text-white shadow-[0_12px_30px_rgba(15,28,43,0.3)] transition active:scale-[.98] md:max-w-[360px]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
          {working ? (
            <span aria-hidden className="block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight">{text}</span>
          {working && sub ? (
            <span dir="auto" className="block truncate text-[11px] leading-tight text-white/70">
              {sub}
            </span>
          ) : null}
        </span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-white/60 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
