import { NextResponse, after } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { RUN_MS, claimNextJob, kickNext, originOf, runJob, startBatch } from "@/lib/ai/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/ai/jobs/batch — "Let the AI handle all" on Needs you.
 * Queues every open item that has no fix waiting for the owner's tap, answers
 * at once, and starts on the first one right here. The rest follow one after
 * another, each in its own server run, whether or not a screen stays open.
 * { retry: true } also sends the items the AI already looked at and left open.
 */
export async function POST(req: Request) {
  const t0 = Date.now();
  if (!(await getOwnerSession())) return NextResponse.json({ ok: false, error: "Sign in again" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "The AI key isn't configured on the server." }, { status: 500 });
  let body: { retry?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  try {
    const started = await startBatch({ retry: body.retry === true });
    if (!started.ok) return NextResponse.json(started, { status: 400 });
    const origin = originOf(req);
    // Usually the first item of this hand-over; nothing when another one is still running (these then wait their turn).
    const job = await claimNextJob().catch((e) => {
      console.error("[strow-ai] could not start the queue:", e instanceof Error ? e.message : e);
      return null;
    });
    if (job) {
      after(async () => {
        await runJob(job, t0, "start");
        await kickNext(origin, t0 + RUN_MS);
      });
    }
    return NextResponse.json(started);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
