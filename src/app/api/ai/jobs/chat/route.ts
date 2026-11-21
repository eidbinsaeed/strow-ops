import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { chatLive } from "@/lib/ai/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/ai/jobs/chat?c=<chat>&after=<time of the newest message the screen has>
 * What a chat screen needs to stay current while the AI works in the
 * background: new saved messages, the run in progress with its steps, and
 * what is waiting. The screen asks about once a second while something runs.
 */
export async function GET(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const url = new URL(req.url);
  const c = url.searchParams.get("c") ?? "";
  const after = url.searchParams.get("after") || null;
  if (!UUID.test(c) || (after && Number.isNaN(Date.parse(after)))) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    return NextResponse.json(await chatLive(c, after), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
