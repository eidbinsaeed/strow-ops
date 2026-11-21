import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { cancelJobs } from "@/lib/ai/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

/**
 * POST /api/ai/jobs/cancel { chatId | batchId | jobId } — Stop.
 * Jobs still waiting are dropped; the one running is told to stop and winds
 * down within a few seconds, keeping the changes it already made (each has Undo).
 */
export async function POST(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ ok: false, error: "Sign in again" }, { status: 401 });
  let body: { chatId?: unknown; batchId?: unknown; jobId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const target = { chatId: id(body.chatId), batchId: id(body.batchId), jobId: id(body.jobId) };
  if (!target.chatId && !target.batchId && !target.jobId) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  try {
    return NextResponse.json(await cancelJobs(target));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
