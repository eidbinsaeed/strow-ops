import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { jobsStatus } from "@/lib/ai/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/jobs — every AI run that is working or waiting, the hand-over
 * in progress, and what became of the Needs-you items the AI worked on.
 * Read by the "AI working" pill on every owner page and by Needs you.
 * It also closes runs that were cut off, so an open screen keeps the list honest.
 */
export async function GET() {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  try {
    return NextResponse.json(await jobsStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
