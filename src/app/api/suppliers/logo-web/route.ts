import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { findSupplierLogoOnWeb } from "@/lib/ai/find-web-image";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Find a vendor's logo on its own website. Returns it as a data URL; the browser shrinks and saves it. */
export async function POST(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI is not configured" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { supplierId?: unknown };
  const id = typeof body.supplierId === "string" && UUID.test(body.supplierId) ? body.supplierId : null;
  if (!id) return NextResponse.json({ error: "bad supplier" }, { status: 400 });
  const r = await findSupplierLogoOnWeb(id);
  const stop = r.status === "error" && /credit|switched off|not configured/i.test(r.reason);
  return NextResponse.json(r, { status: stop ? 402 : 200 });
}
