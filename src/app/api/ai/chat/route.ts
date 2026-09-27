import { NextResponse } from "next/server";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { runAgent } from "@/lib/ai/agent";
import type { ToolContext } from "@/lib/ai/tools";
import type { Block, StreamEvent } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function summarize(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "text":
          return b.text;
        case "chart":
          return `[Chart shown: ${b.title} — ${b.labels
            .slice(0, 24)
            .map((l, i) => `${l}: ${b.series.map((s) => s.values[i]).join("/")}`)
            .join(", ")}]`;
        case "table":
          return `[Table shown: ${b.title ?? ""} (${b.rows.length} rows)]`;
        case "stats":
          return `[Stats shown: ${b.items.map((i) => `${i.label} ${i.value}`).join("; ")}]`;
        case "action":
          return `[Change ${b.status}: ${b.title} (action ${b.id})]`;
        case "bill":
          return `[Bill photo shown: ${b.table} ${b.id}]`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
}

function friendly(msg: string): string {
  if (/credit balance|billing|quota|insufficient/i.test(msg)) return "The AI account is out of credit — top up the Anthropic API balance and try again.";
  if (/api[_ ]?key|authentication|401|not set/i.test(msg)) return "The AI key isn't configured on the server.";
  if (/overloaded|529|rate/i.test(msg)) return "The AI is busy right now — try again in a minute.";
  return "Something went wrong: " + msg.slice(0, 200);
}

function mergeRoles(list: { role: "user" | "assistant"; content: string }[]): MessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of list) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else out.push({ ...m });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export async function POST(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: { chatId?: unknown; message?: unknown; page?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const message = String(body.message ?? "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });

  const db = createServiceClient();
  let chatId: string | null = typeof body.chatId === "string" && UUID.test(body.chatId) ? body.chatId : null;
  if (chatId) {
    const { data } = await db.from("ai_chats").select("id").eq("id", chatId).maybeSingle();
    if (!data) chatId = null;
  }
  if (!chatId) {
    const { data, error } = await db.from("ai_chats").insert({ title: message.slice(0, 80) }).select("id").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not start chat" }, { status: 500 });
    chatId = (data as { id: string }).id;
  }
  const cid = chatId;

  const { data: hist } = await db
    .from("ai_messages")
    .select("role, text")
    .eq("chat_id", cid)
    .order("created_at", { ascending: false })
    .limit(16);
  const history = ((hist ?? []) as { role: "user" | "assistant"; text: string | null }[])
    .reverse()
    .filter((m) => m.text && m.text.trim())
    .map((m) => ({ role: m.role, content: m.text as string }));

  await db.from("ai_messages").insert({ chat_id: cid, role: "user", blocks: [{ type: "text", text: message }], text: message });

  const page = typeof body.page === "string" ? body.page.slice(0, 80) : "";
  const messages = mergeRoles([...history, { role: "user", content: message + (page ? `\n\n(The owner is on the page ${page}.)` : "") }]);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* client went away */
        }
      };
      const ctx: ToolContext = { mode: "chat", chatId: cid, emit: send, blocks: [], photosLeft: 6, actions: [] };
      send({ t: "chat", chatId: cid });
      send({ t: "status", text: "Thinking" });
      try {
        const system = await buildSystemPrompt("chat");
        const res = await runAgent({ system, messages, ctx, maxSteps: 14, deadline: Date.now() + 255_000 });
        if (!ctx.blocks.some((b) => b.type !== "followups")) {
          const b: Block = { type: "text", text: res.text || "Done." };
          ctx.blocks.push(b);
          send({ t: "block", block: b });
        }
        await db.from("ai_messages").insert({ chat_id: cid, role: "assistant", blocks: ctx.blocks, text: summarize(ctx.blocks) });
        await db.from("ai_chats").update({ updated_at: new Date().toISOString() }).eq("id", cid);
      } catch (e) {
        const msg = friendly(e instanceof Error ? e.message : String(e));
        send({ t: "error", message: msg });
        const blocks: Block[] = [...ctx.blocks, { type: "text", text: "⚠️ " + msg }];
        await db.from("ai_messages").insert({ chat_id: cid, role: "assistant", blocks, text: summarize(blocks) });
      }
      send({ t: "done" });
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
