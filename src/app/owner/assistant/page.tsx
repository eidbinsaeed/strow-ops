import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { AssistantChat, type ChatLiveStart, type ChatMessage } from "@/components/ai/AssistantChat";
import { loadChat } from "@/lib/ai/jobs";
import { BackButton } from "@/components/pulse/BackButton";
import { HistoryMenu } from "@/components/ai/HistoryMenu";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; new?: string }> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.slice(0, 1000) : undefined;
  const db = createServiceClient();

  const [chatsRes, openRes] = await Promise.all([
    db.from("ai_chats").select("id, title, updated_at").not("title", "like", "[مالية]%").order("updated_at", { ascending: false }).limit(40),
    db.from("ai_actions").select("*", { count: "exact", head: true }).in("status", ["proposed", "info"]),
  ]);
  const chats = (chatsRes.data ?? []) as { id: string; title: string | null; updated_at: string }[];

  // Coming back to the AI reopens the chat you were in — unless you tapped "+ New" or asked something new.
  const explicit = sp.c && UUID.test(sp.c) ? sp.c : null;
  const chatId = explicit ?? (!q && sp.new !== "1" ? (chats[0]?.id ?? null) : null);

  // The chat as it is saved, plus a run still going in it (started here earlier, or handed over from Needs you):
  // the screen picks that run up where it is and follows it.
  const loaded = chatId ? await loadChat(chatId) : null;
  const initialMessages: ChatMessage[] = loaded?.messages ?? [];
  const liveNow: ChatLiveStart | null = loaded?.live ?? null;
  const openCount = openRes.count ?? 0;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-2.5 md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <BackButton fallback="/owner" className="-ms-1 w-9 shrink-0 justify-center md:hidden" />
          <span className="ai-orb h-8 w-8 shrink-0" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-[15px] font-medium leading-tight">Strow AI</h1>
            <p className="truncate text-[11px] text-neutral-500">Sees all your books · every change has Undo</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link href="/owner/assistant/activity" className="relative rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700">
            Activity
            {openCount > 0 ? (
              <span className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">{openCount}</span>
            ) : null}
          </Link>
          <HistoryMenu key={chatId ?? "new"} chats={chats} currentId={chatId} />
          <Link href={"/owner/assistant?new=1" as Route} className="rounded-full bg-strow-ink px-3 py-1.5 text-xs text-white">
            + New
          </Link>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <AssistantChat
          key={chatId ?? `new:${q ?? ""}:${sp.new ?? ""}`}
          initialChatId={chatId}
          initialMessages={initialMessages}
          initialLive={liveNow}
          initialPrompt={chatId ? undefined : q}
          variant="full"
        />
      </div>
    </div>
  );
}
