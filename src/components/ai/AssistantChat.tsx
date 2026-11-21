"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Block, FollowupsBlock, Step, StepsBlock } from "@/lib/ai/types";
import type { ChatLive, LiveJob, SavedMessage } from "@/lib/ai/job-types";
import { refreshAiJobs } from "./useAiJobs";
import { ChatToolsProvider } from "./ChatTools";
import { Steps } from "./Steps";
import { Chart, DataTable, Stats } from "./Charts";
import { Markdown } from "./Markdown";
import { ActionCard } from "./ActionButtons";
import { BillCard } from "./PhotoViewer";
import { useLocale } from "@/components/owner/LocaleProvider";
import { BlockBoundary } from "./BlockBoundary";
import { splitChartNotes } from "@/lib/ai/chartText";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
  /** When it was saved (the server's timestamp, passed back as-is to ask for newer messages). */
  at?: string;
};

/** The run in progress and what is waiting behind it, as the page read it when it rendered. */
export type ChatLiveStart = { now: string; job: LiveJob | null; queued: { id: string; title: string | null }[] };

/**
 * A run in progress as this screen shows it (times in this device's clock).
 * `key` is the row it is drawn on: the saved answer later takes the same row,
 * so the live steps fold into "How I got this" instead of the answer jumping in.
 */
type LiveView = { key: string; id: string | null; steps: Step[]; blocks: Block[]; startedAt: number; stopping: boolean };

/** How often the screen asks for the run's progress. */
const POLL_MS = 1100;

const COPY = {
  en: {
    placeholder: "Ask anything about the café…",
    thinking: "Thinking",
    welcome: "Ask Strow AI anything",
    sub: "It reads all your sales, bills, items, staff and cash — and fixes mistakes for you. Every change has Undo.",
    listening: "Listening…",
    tryThese: "Try one of these",
    error: "Something went wrong",
    expired: "Your session expired — sign in again.",
    leave: "You can leave this page. It keeps working, and the answer will be here when you come back.",
    upNext: "Up next",
    more: "more",
    stop: "Stop",
    stopping: "Stopping…",
  },
  ar: {
    placeholder: "اسأل أي شيء عن المقهى…",
    thinking: "أفكر",
    welcome: "اسأل Strow AI أي شيء",
    sub: "يقرأ كل المبيعات والفواتير والأصناف والموظفين والنقد — ويصلح الأخطاء بنفسه. كل تغيير قابل للتراجع.",
    listening: "أستمع…",
    tryThese: "جرّب أحد هذه",
    error: "حدث خطأ",
    expired: "انتهت الجلسة — سجّل الدخول من جديد.",
    leave: "يمكنك مغادرة هذه الصفحة. سيواصل العمل وستجد الإجابة هنا عند عودتك.",
    upNext: "التالي",
    more: "أخرى",
    stop: "إيقاف",
    stopping: "جارٍ الإيقاف…",
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

function rid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
}

function isCoarse(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}

function viewOf(job: LiveJob, skew: number, was?: LiveView | null): LiveView {
  const t = job.startedAt ? Date.parse(job.startedAt) : NaN;
  // Same run as the one on screen (or the one just sent, whose id wasn't known yet): keep its row and its clock.
  const same = was && (was.id === job.id || was.id === null) ? was : null;
  return {
    key: same?.key ?? `job:${job.id}`,
    id: job.id,
    steps: job.steps ?? [],
    blocks: job.blocks ?? [],
    startedAt: same && same.id === null ? same.startedAt : Number.isNaN(t) ? Date.now() : t - skew,
    stopping: !!job.stopping,
  };
}

/** New saved messages go on the end; ones already on screen (by id) are left as they are. */
function mergeSaved(have: ChatMessage[], incoming: SavedMessage[]): ChatMessage[] {
  const known = new Set(have.map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));
  return fresh.length ? [...have, ...fresh] : have;
}

export function AssistantChat({
  initialChatId = null,
  initialMessages = [],
  initialLive = null,
  variant = "full",
  contextPath,
  initialPrompt,
  onChatId,
  mode,
  suggestions,
  copy,
  basePath = "/owner/assistant",
}: {
  initialChatId?: string | null;
  initialMessages?: ChatMessage[];
  /** The run already going in this chat when the page rendered (it picks up from there). */
  initialLive?: ChatLiveStart | null;
  variant?: "full" | "sheet";
  contextPath?: string;
  initialPrompt?: string;
  onChatId?: (id: string) => void;
  mode?: "finance";
  suggestions?: string[];
  copy?: Partial<(typeof COPY)["en"]>;
  basePath?: string;
}) {
  const locale = useLocale();
  const t = useMemo(() => ({ ...(COPY[locale] ?? COPY.en), ...(copy ?? {}) }), [locale, copy]);
  const [chatId, setChatId] = useState<string | null>(initialChatId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  // The run in progress lives on the server; this is the screen's copy of it.
  const [live, setLive] = useState<LiveView | null>(() => (initialLive?.job ? viewOf(initialLive.job, Date.parse(initialLive.now) - Date.now() || 0) : null));
  const [queued, setQueued] = useState<{ id: string; title: string | null }[]>(initialLive?.queued ?? []);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Clock-based text (seconds) only after the page is live in the browser, so it matches what the server drew.
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const chatIdRef = useRef<string | null>(initialChatId);
  const sentInitial = useRef(false);
  const stick = useRef(true);
  /** Time of the newest saved message on screen, as the server wrote it: "anything newer than this?" */
  const cursor = useRef<string | null>([...initialMessages].reverse().find((m) => m.at)?.at ?? null);
  /** Goes up with every send, so an answer to an older question about the chat's state is dropped. */
  const gen = useRef(0);
  const sendingRef = useRef(false);
  const liveRef = useRef<LiveView | null>(live);
  /** Saved answer id → the row its run was drawn on while it was live. */
  const rowKey = useRef(new Map<string, string>());
  /** The loop that follows a run: id 0 = none. */
  const poll = useRef<{ id: number; timer?: number }>({ id: 0 });
  const loops = useRef(0);

  const busy = sending || !!live || queued.length > 0;
  const busyRef = useRef(busy);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);
  useEffect(() => {
    liveRef.current = live;
    busyRef.current = busy;
  }, [live, busy]);

  useEffect(() => {
    setHasMic(!!getSR());
    setNow(Date.now());
    setReady(true);
    return () => recRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  useEffect(() => {
    if (!live && !queued.length) setStopping(false);
  }, [live, queued.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, live]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  /** Reads the chat's current state from the server. Returns whether something is still running or waiting. */
  const sync = useCallback(async (): Promise<boolean> => {
    const cid = chatIdRef.current;
    if (!cid) return false;
    const mine = gen.current;
    const after = cursor.current;
    const r = await fetch(`/api/ai/jobs/chat?c=${encodeURIComponent(cid)}${after ? `&after=${encodeURIComponent(after)}` : ""}`, { cache: "no-store" });
    if (r.status === 401) return false;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as ChatLive;
    // A newer question went out, or another chat was opened, while this was on its way.
    if (mine !== gen.current || cid !== chatIdRef.current) return true;
    const skew = (Date.parse(j.now) || Date.now()) - Date.now();
    if (j.messages.length) {
      cursor.current = j.messages[j.messages.length - 1].at;
      // The run that was live just ended: its saved answer takes its row.
      const was = liveRef.current;
      if (!j.job && was) {
        const answer = j.messages.find((m) => m.role === "assistant");
        if (answer) rowKey.current.set(answer.id, was.key);
      }
      setMessages((ms) => mergeSaved(ms, j.messages));
    }
    // While a send is still on its way, "nothing running" only means the server hasn't heard of it yet.
    const job = j.job;
    if (job) setLive((cur) => viewOf(job, skew, cur));
    else if (!sendingRef.current) setLive(null);
    setQueued(j.queued ?? []);
    return !!j.job || (j.queued ?? []).length > 0 || sendingRef.current;
  }, []);

  /**
   * Keeps asking while something runs; stops by itself when the chat is quiet.
   * Only one loop is ever alive: `now` starts a fresh one that asks at once (the app came back to the front).
   */
  const follow = useCallback(
    (now = false) => {
      if (poll.current.id && !now) return;
      window.clearTimeout(poll.current.timer);
      const me = (loops.current += 1);
      poll.current.id = me;
      let fails = 0;
      const tick = async () => {
        if (poll.current.id !== me) return;
        // Nobody is looking (another tab, phone locked): the run carries on server-side, the screen catches up when it is back.
        if (document.visibilityState !== "visible") {
          poll.current.timer = window.setTimeout(tick, 3000);
          return;
        }
        let more = true;
        try {
          more = await sync();
          fails = 0;
        } catch {
          fails++; // offline or a hiccup: keep asking
        }
        if (poll.current.id !== me) return;
        if (more) poll.current.timer = window.setTimeout(tick, fails ? Math.min(8000, 1500 * fails) : POLL_MS);
        else poll.current.id = 0;
      };
      void tick();
    },
    [sync],
  );

  // On arrival (and whenever the app comes back to the front): catch up with whatever happened while this screen was away.
  useEffect(() => {
    if (chatIdRef.current) follow();
    const onShow = () => {
      if (document.visibilityState === "visible" && chatIdRef.current) follow(true);
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("online", onShow);
    const p = poll.current;
    return () => {
      p.id = 0;
      window.clearTimeout(p.timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("online", onShow);
    };
  }, [follow]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busyRef.current || sendingRef.current) return;
      recRef.current?.stop();
      stick.current = true;
      gen.current++;
      sendingRef.current = true;
      setSending(true);
      setInput("");
      if (taRef.current) taRef.current.style.height = "";
      const localId = `local:${rid()}`;
      setMessages((ms) => [...ms, { id: localId, role: "user", blocks: [{ type: "text", text }] }]);
      setLive({ key: `row:${rid()}`, id: null, steps: [], blocks: [], startedAt: Date.now(), stopping: false });
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: chatIdRef.current, message: text, page: contextPath, mode, v: 2 }),
        });
        const j = (await res.json().catch(() => ({}))) as { chatId?: string; jobId?: string; userMessageId?: string | null; at?: string; attached?: boolean; error?: string };
        if (!res.ok || !j.chatId || !j.jobId) throw new Error(res.status === 401 ? t.expired : j.error || `HTTP ${res.status}`);
        // The AI is already on this item in another chat (it was handed over with the list): go and watch that run.
        if (j.attached && j.chatId !== chatIdRef.current) {
          window.location.assign(`${basePath}?c=${j.chatId}`);
          return;
        }
        if (j.chatId !== chatIdRef.current) {
          chatIdRef.current = j.chatId;
          setChatId(j.chatId);
          onChatId?.(j.chatId);
          if (variant === "full") window.history.replaceState(window.history.state, "", `${basePath}?c=${j.chatId}`);
        }
        if (j.userMessageId && j.at) {
          const id = j.userMessageId;
          const at = j.at;
          // The question now has its saved id. If a catch-up read already brought the saved copy in, the local one just goes.
          setMessages((ms) => (ms.some((m) => m.id === id) ? ms.filter((m) => m.id !== localId) : ms.map((m) => (m.id === localId ? { ...m, id, at } : m))));
          if (!cursor.current || Date.parse(at) > Date.parse(cursor.current)) cursor.current = at;
        }
        const jobId = j.jobId;
        setLive((l) => (l ? { ...l, id: jobId } : l));
        sendingRef.current = false;
        setSending(false);
        follow();
        refreshAiJobs();
      } catch (e) {
        setLive(null);
        setMessages((ms) => [...ms, { id: `local:${rid()}`, role: "assistant", blocks: [{ type: "text", text: `⚠️ ${(e as Error)?.message || t.error}` }] }]);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [contextPath, onChatId, t, variant, mode, basePath, follow],
  );

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      void send(initialPrompt);
    }
  }, [initialPrompt, send]);

  /** Stop really stops the server run (and drops what is waiting behind it). Changes already made stay, each with Undo. */
  const stopRun = useCallback(async () => {
    const cid = chatIdRef.current;
    if (!cid) return;
    setStopping(true);
    try {
      await fetch("/api/ai/jobs/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: cid }) });
      follow();
      refreshAiJobs();
    } catch {
      setStopping(false);
    }
  }, [follow]);

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
  const tools = useMemo(() => ({ ask: (q: string) => void send(q), chatId, canPin: !mode }), [send, chatId, mode]);
  const liveSeconds = live && ready ? Math.max(0, Math.round((now - live.startedAt) / 1000)) : 0;
  const winding = stopping || !!live?.stopping;
  const canStop = !!chatId && !sending && !winding;
  // One list for saved and live rows: when a run ends, its saved answer has the same key as its live row and React keeps the row.
  const rows: React.ReactNode[] = messages.map((m) => {
    if (m.role === "user") return <UserBubble key={m.id} m={m} />;
    const saved = m.blocks.find((b): b is StepsBlock => b.type === "steps");
    return <AnswerRow key={rowKey.current.get(m.id) ?? m.id} steps={saved?.items ?? []} blocks={m.blocks} live={false} seconds={saved?.seconds} fallback={t.thinking} />;
  });
  if (live) {
    rows.push(
      <AnswerRow
        key={live.key}
        steps={live.steps}
        blocks={live.blocks}
        live
        seconds={liveSeconds}
        fallback={winding ? t.stopping : t.thinking}
        hint={liveSeconds >= 4 && !winding ? t.leave : undefined}
      />,
    );
  }

  return (
    <ChatToolsProvider value={tools}>
    <div className="flex h-full min-h-0 flex-col bg-strow-bg">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={`mx-auto w-full space-y-5 ${full ? "max-w-3xl px-4 py-5" : "px-3 py-4"}`}>
          {messages.length === 0 && !live ? (
            <Welcome t={t} suggestions={suggestions ?? SUGGEST[locale] ?? SUGGEST.en} onPick={(s) => void send(s)} compact={!full} />
          ) : (
            rows
          )}
          {queued.length ? (
            <div className="rounded-2xl border border-neutral-200 bg-white/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                {t.upNext} · {queued.length}
              </p>
              <ul className="mt-1.5 space-y-1">
                {queued.slice(0, 6).map((q) => (
                  <li key={q.id} className="flex items-start gap-2 text-sm text-neutral-500">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
                    <span className="min-w-0 truncate" dir="auto">{(q.title ?? "").replace(/^Fix:\s*/i, "") || "…"}</span>
                  </li>
                ))}
                {queued.length > 6 ? (
                  <li className="ps-3.5 text-xs text-neutral-400">
                    +{queued.length - 6} {t.more}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
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
              onClick={() => void stopRun()}
              disabled={!canStop}
              aria-label={t.stop}
              title={t.stop}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-strow-ink transition disabled:opacity-40"
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
    </ChatToolsProvider>
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

function UserBubble({ m }: { m: ChatMessage }) {
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

/** One answer: its steps (ticking in while it runs, folded once it is saved) and what the AI wrote. */
function AnswerRow({ steps, blocks, live, seconds, fallback, hint }: { steps: Step[]; blocks: Block[]; live: boolean; seconds?: number; fallback: string; hint?: string }) {
  const visible = blocks.filter((b) => b.type !== "followups" && b.type !== "steps");
  return (
    <div className="space-y-3">
      <Steps items={steps} live={live} seconds={seconds} thinking={fallback} />
      {visible.map((b, i) => (
        <BlockBoundary key={i}>
          <BlockView b={b} />
        </BlockBoundary>
      ))}
      {hint ? <p className="ai-fade text-xs leading-relaxed text-neutral-400">{hint}</p> : null}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case "text": {
      // A chart written out as a text note (old history format) → draw it as a real chart.
      const parts = splitChartNotes(String(b.text ?? ""));
      if (parts.some((p) => p.type === "chart"))
        return (
          <div className="space-y-3">
            {parts.map((p, i) => (
              <BlockView key={i} b={p} />
            ))}
          </div>
        );
      return (
        <div className="ai-rise">
          <Markdown text={String(b.text ?? "")} />
        </div>
      );
    }
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
