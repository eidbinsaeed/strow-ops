import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { findLogoForSupplier } from "@/lib/ai/find-logo";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where is this supplier's logo on one of its past bills? (The browser cuts it out.) */
export async function POST(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI is not configured" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { supplierId?: unknown };
  const id = typeof body.supplierId === "string" && UUID.test(body.supplierId) ? body.supplierId : null;
  if (!id) return NextResponse.json({ error: "bad supplier" }, { status: 400 });
  const r = await findLogoForSupplier(id);
  return NextResponse.json(r, { status: r.status === "error" && /credit balance/i.test(r.reason) ? 402 : 200 });
}
