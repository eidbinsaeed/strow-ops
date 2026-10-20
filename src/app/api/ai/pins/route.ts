import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";
import { runSource } from "@/lib/ai/pins";
import { sanitizeChart, sanitizeTable } from "@/lib/ai/tools";
import type { ChartBlock, TableBlock } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pin a chart or table from the chat to Home. The block is cleaned the same
 * way the AI's own tool input is; its SQL (if any) is run once through the
 * read-only ai_read_query and kept only if it really rebuilds the block.
 */
export async function POST(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ ok: false, error: "Sign in again" }, { status: 401 });
  let body: { block?: Record<string, unknown>; chatId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const raw = body.block ?? {};
  let block: ChartBlock | TableBlock;
  if (raw.type === "chart") block = sanitizeChart(raw);
  else if (raw.type === "table") {
    const t = sanitizeTable({ ...raw, highlight_rows: raw.highlight, highlight_note: raw.highlightNote });
    block = raw.totals === true ? { ...t, totals: true } : t;
  } else return NextResponse.json({ ok: false, error: "Only charts and tables can be pinned" }, { status: 400 });

  const sql = typeof raw.source === "string" && raw.source.trim() ? raw.source.trim().slice(0, 4000) : null;
  let live = false;
  if (sql) {
    const r = await runSource(block, sql).catch(() => ({ error: "failed" }) as const);
    live = "block" in r;
  }
  const db = createServiceClient();
  const chatId = typeof body.chatId === "string" && UUID.test(body.chatId) ? body.chatId : null;
  // Pinning the same chart again (or from full screen) updates the pin instead of adding a second one.
  const dupe = await db.from("ai_pins").select("id").eq("kind", block.type).eq("title", block.title ?? "").limit(1);
  const existing = ((dupe.data ?? [])[0] as { id: string } | undefined)?.id;
  if (existing) {
    const up = await db.from("ai_pins").update({ block, source_sql: live ? sql : null, chat_id: chatId }).eq("id", existing);
    if (up.error) return NextResponse.json({ ok: false, error: up.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: existing, live, existed: true });
  }
  const { data: last } = await db.from("ai_pins").select("position").order("position", { ascending: false }).limit(1);
  const position = (((last ?? [])[0] as { position?: number } | undefined)?.position ?? 0) + 1;
  const { data, error } = await db
    .from("ai_pins")
    .insert({ kind: block.type, title: block.title ?? "", block, source_sql: live ? sql : null, chat_id: chatId, position })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Could not pin" }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id, live });
}

/** Take a pin off Home. */
export async function DELETE(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ ok: false, error: "Sign in again" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  const { error } = await createServiceClient().from("ai_pins").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
