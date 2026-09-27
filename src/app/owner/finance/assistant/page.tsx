import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { AssistantChat, type ChatMessage } from "@/components/ai/AssistantChat";
import { BackButton } from "@/components/pulse/BackButton";
import { HistoryMenu } from "@/components/ai/HistoryMenu";
import type { Block } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUGGEST = [
  "الشهر هذا دفعت ٤٠٠٠ درهم لتصليح السيارة",
  "كم باقي علي أدفع هالشهر؟",
  "وين يروح أغلب فلوسي؟ ارسمها",
  "كم أقدر أوفر لين نهاية السنة؟",
  "قارن مصاريفي آخر ٣ شهور",
  "متى أخلص أقساطي؟",
];
const COPY = {
  welcome: "اسأل مساعدك المالي",
  sub: "يسجّل مصاريفك في الباب الصح ويحلّل ميزانيتك بالرسوم — وكل تعديل له تراجع.",
  placeholder: "مثال: دفعت ٤٠٠٠ لتصليح السيارة",
  tryThese: "جرّب",
  thinking: "أفكر",
};

export default async function FinanceAssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; new?: string }> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.slice(0, 1000) : undefined;
  const db = createServiceClient();
  const { data: chatRows } = await db.from("ai_chats").select("id, title, updated_at").like("title", "[مالية]%").order("updated_at", { ascending: false }).limit(40);
  const chats = (chatRows ?? []) as { id: string; title: string | null; updated_at: string }[];
  const explicit = sp.c && UUID.test(sp.c) ? sp.c : null;
  const chatId = explicit ?? (!q && sp.new !== "1" ? (chats[0]?.id ?? null) : null);

  const msgsRes = chatId
    ? await db.from("ai_messages").select("id, role, blocks").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(200)
    : { data: [] as unknown[] };
  const initialMessages: ChatMessage[] = ((msgsRes.data ?? []) as { id: string; role: "user" | "assistant"; blocks: Block[] }[]).map((m) => ({
    id: m.id,
    role: m.role,
    blocks: Array.isArray(m.blocks) ? m.blocks : [],
  }));
  const actionIds = initialMessages.flatMap((m) => m.blocks.filter((b) => b.type === "action").map((b) => (b as { id: string }).id));
  if (actionIds.length) {
    const { data: live } = await db.from("ai_actions").select("id, status").in("id", actionIds);
    const now = new Map(((live ?? []) as { id: string; status: string }[]).map((a) => [a.id, a.status]));
    for (const m of initialMessages) m.blocks = m.blocks.map((b) => (b.type === "action" && now.has(b.id) ? { ...b, status: now.get(b.id) as string } : b));
  }

  return (
    <div dir="rtl" className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <BackButton fallback="/owner/finance" className="-ms-1 w-9 shrink-0 justify-center" />
          <span className="ai-orb h-8 w-8 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight">المساعد المالي</p>
            <p className="truncate text-[11px] text-neutral-500">ميزانيتك الشخصية فقط — كل تعديل له تراجع</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <HistoryMenu key={chatId ?? "new"} chats={chats} currentId={chatId} basePath="/owner/finance/assistant" />
          <Link href={"/owner/finance/assistant?new=1" as Route} className="rounded-full bg-strow-ink px-3 py-1.5 text-xs text-white">
            + جديد
          </Link>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <AssistantChat
          key={chatId ?? `new:${q ?? ""}:${sp.new ?? ""}`}
          initialChatId={chatId}
          initialMessages={initialMessages}
          initialPrompt={chatId ? undefined : q}
          variant="full"
          mode="finance"
          basePath="/owner/finance/assistant"
          suggestions={SUGGEST}
          copy={COPY}
        />
      </div>
    </div>
  );
}
