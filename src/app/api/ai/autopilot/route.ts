import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { runAutopilot } from "@/lib/ai/autopilot";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Nightly sweep (Vercel Cron, see vercel.json).
// With CRON_SECRET set, Vercel sends it as a Bearer token and nothing else gets in.
// Without it, the cron user-agent could be faked, so at most one unattended run
// per 20 hours is allowed: a fake call can never do more than the real nightly job.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauth" }, { status: 401 });
  } else {
    if (!(req.headers.get("user-agent") ?? "").includes("vercel-cron")) return NextResponse.json({ error: "unauth" }, { status: 401 });
    const since = new Date(Date.now() - 20 * 3600_000).toISOString();
    const { data: recent } = await createServiceClient().from("ai_runs").select("id").eq("trigger", "cron").gt("started_at", since).limit(1);
    if (recent && recent.length) return NextResponse.json({ skipped: true, reason: "Already ran in the last 20 hours" });
  }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI key missing" }, { status: 500 });
  try {
    return NextResponse.json(await runAutopilot("cron"));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// "Run check now" button on the dashboard.
export async function POST() {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "The AI key isn't configured on the server." }, { status: 500 });
  try {
    return NextResponse.json(await runAutopilot("manual"));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
