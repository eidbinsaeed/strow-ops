import { NextResponse, after } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";
import { runJob, startChatJob } from "@/lib/ai/jobs";
import type { Block } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/ai/chat — one message to Strow AI.
 *
 * The message becomes a background job (ai_jobs): this request saves it,
 * answers at once with the chat and job ids, and the AI works on it after the
 * response. The screen follows the job through GET /api/ai/jobs/chat, so the
 * owner can leave the page, browse elsewhere and come back: the run carries
 * on and its steps and answer are waiting for him.
 */
export async function POST(req: Request) {
  const t0 = Date.now();
  if (!(await getOwnerSession())) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: { chatId?: unknown; message?: unknown; page?: unknown; mode?: unknown; v?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const message = String(body.message ?? "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });

  const started = await startChatJob({
    chatId: typeof body.chatId === "string" ? body.chatId : null,
    message,
    page: typeof body.page === "string" ? body.page.slice(0, 80) : "",
    finance: body.mode === "finance",
  });
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });

  const job = started.job;
  if (job) after(() => runJob(job, t0));

  if (body.v === 2) {
    return NextResponse.json(
      { chatId: started.chatId, jobId: started.jobId, userMessageId: started.userMessageId, at: started.at, attached: started.attached },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // A tab still running the page from before this change expects a stream of
  // steps. Give it the chat id, then drop the connection: that page already
  // knows what to do when a connection drops (it fetches the saved answer
  // with the GET below once the run is done).
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ t: "chat", chatId: started.chatId, at: started.at }) + "\n"));
      controller.enqueue(encoder.encode(JSON.stringify({ t: "status", text: "Working in the background" }) + "\n"));
      setTimeout(() => {
        try {
          controller.error(new Error("The run continues in the background"));
        } catch {
          /* already closed */
        }
      }, 200);
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

// The newest saved answer after a given time (used by a page from before background runs; see POST).
export async function GET(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const url = new URL(req.url);
  const c = url.searchParams.get("c") ?? "";
  const after = url.searchParams.get("after") ?? "";
  if (!UUID.test(c) || Number.isNaN(Date.parse(after))) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const db = createServiceClient();
  const { data } = await db
    .from("ai_messages")
    .select("blocks, created_at")
    .eq("chat_id", c)
    .eq("role", "assistant")
    .gt("created_at", new Date(after).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const m = ((data ?? [])[0] ?? null) as { blocks: Block[]; created_at: string } | null;
  return NextResponse.json({ message: m }, { headers: { "Cache-Control": "no-store" } });
}

// Delete a chat from History. The changes it made (and their Undo) stay in AI activity.
export async function DELETE(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ ok: false, error: "Sign in again" }, { status: 401 });
  const c = new URL(req.url).searchParams.get("c") ?? "";
  if (!UUID.test(c)) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  const db = createServiceClient();
  const unlink = await db.from("ai_actions").update({ chat_id: null }).eq("chat_id", c);
  if (unlink.error) return NextResponse.json({ ok: false, error: unlink.error.message }, { status: 500 });
  const msgs = await db.from("ai_messages").delete().eq("chat_id", c);
  if (msgs.error) return NextResponse.json({ ok: false, error: msgs.error.message }, { status: 500 });
  const chat = await db.from("ai_chats").delete().eq("id", c);
  if (chat.error) return NextResponse.json({ ok: false, error: chat.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
