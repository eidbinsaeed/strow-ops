"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Block, FollowupsBlock, StreamEvent } from "@/lib/ai/types";
import { Chart, DataTable, Stats } from "./Charts";
import { Markdown } from "./Markdown";
import { ActionCard } from "./ActionButtons";
import { BillCard } from "./PhotoViewer";
import { useLocale } from "@/components/owner/LocaleProvider";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
  pending?: boolean;
  status?: string;
  startedAt?: number;
};

const COPY = {
  en: {
    placeholder: "Ask anything about the café…",
    thinking: "Thinking",
    welcome: "Ask Strow AI anything",
    sub: "It reads all your sales, bills, items, staff and cash — and fixes mistakes for you. Every change has Undo.",
    stopped: "Stopped.",
    listening: "Listening…",
    tryThese: "Try one of these",
    error: "Something went wrong",
    recovering: "Connection dropped — still working, fetching the answer…",
    lost: "Lost the connection. Open this chat again from History in a minute to see the answer.",
  },
  ar: {
    placeholder: "اسأل أي شيء عن المقهى…",
    thinking: "أفكر",
    welcome: "اسأل Strow AI أي شيء",
    sub: "يقرأ كل المبيعات والفواتير والأصناف والموظفين والنقد — ويصلح الأخطاء بنفسه. كل تغيير قابل للتراجع.",
    stopped: "تم الإيقاف.",
    listening: "أستمع…",
    tryThese: "جرّب أحد هذه",
    error: "حدث خطأ",
    recovering: "انقطع الاتصال — ما زلت أعمل، أجلب الإجابة…",
    lost: "انقطع الاتصال. افتح هذه المحادثة من السجل بعد دقيقة لترى الإجابة.",
  },
};

const SUGGEST = {
  en: [
    "What needs my attention today?",
    "Sales this month vs last month — chart it",
    "Which items cost me the most this month?",
    "Why is my cash on hand negative?",
    "Check all my bills for mistakes",
    "Show me the last Al Rawabi milk bill",
  ],
  ar: [
    "ما الذي يحتاج انتباهي اليوم؟",
    "المبيعات هذا الشهر مقارنة بالشهر الماضي — مع رسم بياني",
    "ما أكثر الأصناف تكلفة هذا الشهر؟",
    "لماذا النقد في الصندوق بالسالب؟",
    "افحص كل فواتيري بحثاً عن أخطاء",
    "اعرض لي آخر فاتورة حليب من الروابي",
  ],
};

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getSR(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

async function recoverAnswer(chatId: string, since: string): Promise<Block[] | null> {
  const until = Date.now() + 5 * 60_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const r = await fetch(`/api/ai/chat?c=${encodeURIComponent(chatId)}&after=${encodeURIComponent(since)}`, { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { message?: { blocks?: unknown } | null };
        if (j.message) return Array.isArray(j.message.blocks) ? (j.message.blocks as Block[]) : [];
      }
    } catch {
      /* still offline — keep trying */
    }
  }
  return null;
}

function rid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
}

function isCoarse(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}

export function AssistantChat({
  initialChatId = null,
  initialMessages = [],
  variant = "full",
  contextPath,
  initialPrompt,
  onChatId,
}: {
  initialChatId?: string | null;
  initialMessages?: ChatMessage[];
  variant?: "full" | "sheet";
  contextPath?: string;
  initialPrompt?: string;
  onChatId?: (id: string) => void;
}) {
  const locale = useLocale();
  const t = COPY[locale] ?? COPY.en;
  const [chatId, setChatId] = useState<string | null>(initialChatId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const chatIdRef = useRef<string | null>(initialChatId);
  const sinceRef = useRef<string | null>(null);
  const sentInitial = useRef(false);
  const stick = useRef(true);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    setHasMic(!!getSR());
    return () => recRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      recRef.current?.stop();
      sinceRef.current = null;
      stick.current = true;
      setBusy(true);
      setInput("");
      if (taRef.current) taRef.current.style.height = "";
      const aid = rid();
      setMessages((ms) => [
        ...ms,
        { id: rid(), role: "user", blocks: [{ type: "text", text }] },
        { id: aid, role: "assistant", blocks: [], pending: true, status: t.thinking, startedAt: Date.now() },
      ]);
      const patch = (fn: (m: ChatMessage) => ChatMessage) => setMessages((ms) => ms.map((m) => (m.id === aid ? fn(m) : m)));
      const handle = (ev: StreamEvent) => {
        if (ev.t === "chat") {
          sinceRef.current = ev.at ?? null;
          if (ev.chatId !== chatIdRef.current) {
            chatIdRef.current = ev.chatId;
            setChatId(ev.chatId);
            onChatId?.(ev.chatId);
            if (variant === "full") window.history.replaceState(window.history.state, "", `/owner/assistant?c=${ev.chatId}`);
          }
        } else if (ev.t === "status") patch((m) => ({ ...m, status: ev.text }));
        else if (ev.t === "block") patch((m) => ({ ...m, blocks: [...m.blocks, ev.block] }));
        else if (ev.t === "error") patch((m) => ({ ...m, blocks: [...m.blocks, { type: "text", text: "⚠️ " + ev.message }] }));
      };
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: chatIdRef.current, message: text, page: contextPath }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => "");
          throw new Error(res.status === 401 ? "Your session expired — sign in again." : body.slice(0, 200) || `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl = buf.indexOf("\n");
          while (nl >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) {
              try {
                handle(JSON.parse(line) as StreamEvent);
              } catch {
                /* ignore a malformed line */
              }
            }
            nl = buf.indexOf("\n");
          }
        }
        if (buf.trim()) {
          try {
            handle(JSON.parse(buf) as StreamEvent);
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        const aborted = (e as Error)?.name === "AbortError";
        const since = sinceRef.current;
        const cid = chatIdRef.current;
        if (!aborted && since && cid) {
          // The server keeps working and saves the answer — fetch it instead of losing it.
          patch((m) => ({ ...m, status: t.recovering }));
          const got = await recoverAnswer(cid, since);
          patch((m) => ({ ...m, blocks: got ?? [...m.blocks, { type: "text", text: "⚠️ " + t.lost }] }));
        } else {
          patch((m) => ({ ...m, blocks: [...m.blocks, { type: "text", text: aborted ? t.stopped : `⚠️ ${(e as Error)?.message || t.error}` }] }));
        }
      } finally {
        abortRef.current = null;
        patch((m) => ({ ...m, pending: false, status: undefined }));
        setBusy(false);
      }
    },
    [busy, contextPath, onChatId, t, variant],
  );

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      void send(initialPrompt);
    }
  }, [initialPrompt, send]);

  const toggleMic = () => {
    const SR = getSR();
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = locale === "ar" ? "ar-AE" : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    const base = input.trim() ? input.trimEnd() + " " : "";
    let finals = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput((base + finals + interim).trimStart());
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    rec.onerror = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      recRef.current = null;
    }
  };

  const last = messages[messages.length - 1];
  const followups =
    !busy && last?.role === "assistant"
      ? ((last.blocks.find((b) => b.type === "followups") as FollowupsBlock | undefined)?.items ?? [])
      : [];
  const full = variant === "full";

  return (
    <div className="flex h-full min-h-0 flex-col bg-strow-bg">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={`mx-auto w-full space-y-5 ${full ? "max-w-3xl px-4 py-5" : "px-3 py-4"}`}>
          {messages.length === 0 ? (
            <Welcome t={t} suggestions={SUGGEST[locale] ?? SUGGEST.en} onPick={(s) => void send(s)} compact={!full} />
          ) : (
            messages.map((m) => <MessageView key={m.id} m={m} now={now} fallback={t.thinking} />)
          )}
          {followups.length ? (
            <div className="flex flex-wrap gap-2">
              {followups.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void send(q)}
                  className="ai-rise rounded-full border border-neutral-300 bg-white px-3.5 py-2 text-start text-sm text-neutral-700 shadow-sm transition active:scale-[.98]"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {q}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="border-t border-neutral-200 bg-white/95 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur"
      >
        <div className={`mx-auto flex items-end gap-2 ${full ? "max-w-3xl" : ""}`}>
          {hasMic ? (
            <button
              type="button"
              onClick={toggleMic}
              aria-label="Voice input"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
                listening ? "ai-listening border-red-300 bg-red-50 text-red-600" : "border-neutral-300 bg-white text-neutral-600"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
          ) : null}
          <textarea
            ref={taRef}
            value={input}
            rows={1}
            dir="auto"
            placeholder={listening ? t.listening : t.placeholder}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(160, el.scrollHeight) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isCoarse()) {
                e.preventDefault();
                void send(input);
              }
            }}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl border border-neutral-300 bg-white px-4 py-2.5 text-base leading-6 focus:border-strow-ink focus:outline-none md:text-[15px]"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-strow-ink"
            >
              <span className="block h-3.5 w-3.5 rounded-[3px] bg-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-strow-ink text-white transition active:scale-95 disabled:opacity-25"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Welcome({
  t,
  suggestions,
  onPick,
  compact,
}: {
  t: (typeof COPY)["en"];
  suggestions: string[];
  onPick: (s: string) => void;
  compact: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "pt-2" : "pt-8 md:pt-14"}`}>
      <span className="ai-orb h-14 w-14" aria-hidden />
      <h2 className="mt-4 text-xl font-light tracking-tight text-strow-ink">{t.welcome}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-neutral-500">{t.sub}</p>
      <p className="mt-6 text-[11px] uppercase tracking-wider text-neutral-400">{t.tryThese}</p>
      <div className={`mt-2 grid w-full max-w-xl gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        {suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(s)}
            className="ai-rise rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-start text-sm text-neutral-700 shadow-sm transition hover:border-neutral-300 active:scale-[.99]"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageView({ m, now, fallback }: { m: ChatMessage; now: number; fallback: string }) {
  if (m.role === "user") {
    const first = m.blocks[0];
    const text = first && first.type === "text" ? first.text : "";
    return (
      <div className="flex justify-end">
        <div dir="auto" className="ai-rise max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-ee-md bg-strow-ink px-4 py-2.5 text-[15px] leading-relaxed text-white">
          {text}
        </div>
      </div>
    );
  }
  const visible = m.blocks.filter((b) => b.type !== "followups");
  const seconds = m.startedAt ? Math.max(0, Math.round((now - m.startedAt) / 1000)) : 0;
  return (
    <div className="space-y-3">
      {visible.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
      {m.pending ? (
        <div className="flex items-center gap-2.5 text-sm">
          <span className="ai-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="ai-shimmer min-w-0 truncate">{m.status ?? fallback}</span>
          {seconds >= 3 ? <span className="shrink-0 text-xs tabular-nums text-neutral-400">{seconds}s</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case "text":
      return (
        <div className="ai-rise">
          <Markdown text={b.text} />
        </div>
      );
    case "chart":
      return (
        <div className="ai-rise">
          <Chart block={b} />
        </div>
      );
    case "table":
      return (
        <div className="ai-rise">
          <DataTable block={b} />
        </div>
      );
    case "stats":
      return <Stats block={b} />;
    case "action":
      return (
        <div className="ai-rise">
          <ActionCard a={b} />
        </div>
      );
    case "bill":
      return (
        <div className="ai-rise">
          <BillCard table={b.table} id={b.id} caption={b.caption} />
        </div>
      );
    default:
      return null;
  }
}
