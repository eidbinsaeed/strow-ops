import { NextResponse, after } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { RUN_MS, claimNextJob, isWorkerRequest, kickNext, originOf, reapStaleJobs, runJob } from "@/lib/ai/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/ai/jobs/work — one server run for the next waiting job.
 *
 * Called by the database when a job ends (ai_kick_worker, with the worker
 * token), and by any open owner screen that sees the queue standing still.
 * It takes the next job (if the lane is free), answers at once, works on the
 * job after the response, and then hands over to the next run.
 * Calling it when there is nothing to do is harmless.
 */
export async function POST(req: Request) {
  const t0 = Date.now();
  const worker = isWorkerRequest(req);
  if (!worker && !(await getOwnerSession())) return NextResponse.json({ ok: false, error: "unauth" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "AI key missing" }, { status: 500 });
  // Who made this call, kept with the job: the database ({"from":"db"}), the app itself, or an open screen.
  const from = worker ? await req.json().then((b: { from?: unknown }) => b?.from, () => null) : null;
  const via = !worker ? "screen" : from === "app" ? "app" : "db";
  try {
    await reapStaleJobs().catch(() => 0);
    const job = await claimNextJob();
    if (!job) return NextResponse.json({ ok: true, started: null });
    const origin = originOf(req);
    after(async () => {
      await runJob(job, t0, via);
      await kickNext(origin, t0 + RUN_MS);
    });
    return NextResponse.json({ ok: true, started: job.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
