import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { runOrdersBackfill } from "@/lib/ai/backfill-orders";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI is not configured" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { days?: unknown; exclude?: unknown };
  const days = typeof body.days === "number" && body.days > 0 ? Math.min(Math.round(body.days), 800) : null;
  const exclude = Array.isArray(body.exclude) ? body.exclude.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 500) : [];
  const r = await runOrdersBackfill({ days, max: 6, exclude });
  return NextResponse.json(r, { status: r.error && !r.outcomes.length ? 402 : 200 });
}
