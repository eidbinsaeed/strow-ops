import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { AssistantChat, type ChatMessage } from "@/components/ai/AssistantChat";
import { BackButton } from "@/components/pulse/BackButton";
import type { Block } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  const sp = await searchParams;
  const chatId = sp.c && UUID.test(sp.c) ? sp.c : null;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.slice(0, 1000) : undefined;
  const db = createServiceClient();

  const [chatsRes, msgsRes, openRes] = await Promise.all([
    db.from("ai_chats").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(30),
    chatId
      ? db.from("ai_messages").select("id, role, blocks").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(200)
      : Promise.resolve({ data: [] as unknown[] }),
    db.from("ai_actions").select("*", { count: "exact", head: true }).in("status", ["proposed", "info"]),
  ]);

  const chats = (chatsRes.data ?? []) as { id: string; title: string | null; updated_at: string }[];
  const initialMessages: ChatMessage[] = ((msgsRes.data ?? []) as { id: string; role: "user" | "assistant"; blocks: Block[] }[]).map((m) => ({
    id: m.id,
    role: m.role,
    blocks: Array.isArray(m.blocks) ? m.blocks : [],
  }));
  const openCount = openRes.count ?? 0;

  // Action cards are saved with the status they had at the time; show the current one.
  const actionIds = initialMessages.flatMap((m) => m.blocks.filter((b) => b.type === "action").map((b) => (b as { id: string }).id));
  if (actionIds.length) {
    const { data: live } = await db.from("ai_actions").select("id, status").in("id", actionIds);
    const now = new Map(((live ?? []) as { id: string; status: string }[]).map((a) => [a.id, a.status]));
    for (const m of initialMessages) {
      m.blocks = m.blocks.map((b) => (b.type === "action" && now.has(b.id) ? { ...b, status: now.get(b.id) as string } : b));
    }
  }

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
          {chats.length ? (
            <details key={chatId ?? "new"} className="relative">
              <summary className="cursor-pointer list-none rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 [&::-webkit-details-marker]:hidden">
                History
              </summary>
              <div className="absolute end-0 z-30 mt-2 max-h-80 w-72 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl">
                {chats.map((c) => (
                  <Link
                    key={c.id}
                    href={`/owner/assistant?c=${c.id}` as Route}
                    className={`block truncate rounded-xl px-3 py-2.5 text-sm hover:bg-neutral-100 ${c.id === chatId ? "bg-neutral-100 font-medium" : "text-neutral-700"}`}
                  >
                    {c.title || "Chat"}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
          <Link href="/owner/assistant" className="rounded-full bg-strow-ink px-3 py-1.5 text-xs text-white">
            + New
          </Link>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <AssistantChat
          key={chatId ?? `new:${q ?? ""}`}
          initialChatId={chatId}
          initialMessages={initialMessages}
          initialPrompt={chatId ? undefined : q}
          variant="full"
        />
      </div>
    </div>
  );
}
