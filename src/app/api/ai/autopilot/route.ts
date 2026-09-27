import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { runAutopilot } from "@/lib/ai/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  return (req.headers.get("user-agent") ?? "").includes("vercel-cron");
}

// Nightly sweep (Vercel Cron, see vercel.json).
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauth" }, { status: 401 });
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
