"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AssistantChat } from "./AssistantChat";

const HIDE = ["/owner/finance", "/owner/login"];

/** Desktop: floating "Ask AI" button that opens a chat panel over any page. */
export function AiFab() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  if (pathname === "/owner" || pathname === "/owner/assistant" || HIDE.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setMounted(true);
            setOpen(true);
          }}
          className="ai-pop fixed bottom-6 end-6 z-40 hidden h-12 items-center gap-2.5 rounded-full bg-strow-blue ps-2 pe-5 text-sm text-white shadow-xl transition hover:scale-[1.03] md:flex"
        >
          <span className="ai-orb h-8 w-8" aria-hidden />
          Ask AI
        </button>
      ) : null}
      {mounted ? (
        <div
          className={`fixed bottom-6 end-6 z-50 hidden h-[min(700px,calc(100dvh-3rem))] w-[430px] flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl ${
            open ? "ai-pop md:flex" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="ai-orb h-7 w-7" aria-hidden />
              <span className="text-sm font-medium">Strow AI</span>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href={(chatId ? `/owner/assistant?c=${chatId}` : "/owner/assistant") as Route}
                className="rounded-full px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
              >
                Full screen
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-neutral-500 hover:bg-neutral-100">
                ×
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <AssistantChat variant="sheet" contextPath={pathname} initialChatId={chatId} onChatId={setChatId} />
          </div>
        </div>
      ) : null}
    </>
  );
}
