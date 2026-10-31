import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { findItemPhoto } from "@/lib/ai/find-web-image";
import { markPhotoChecked } from "@/lib/item-photo";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Find a photo of one stock item on the web. Returns it as a data URL; the browser shrinks and saves it. */
export async function POST(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI is not configured" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { itemId?: unknown };
  const id = typeof body.itemId === "string" && UUID.test(body.itemId) ? body.itemId : null;
  if (!id) return NextResponse.json({ error: "bad item" }, { status: 400 });
  const r = await findItemPhoto(id);
  if (r.status === "none") await markPhotoChecked(id);
  const stop = r.status === "error" && /credit|switched off|not configured|refused the request/i.test(r.reason);
  return NextResponse.json(r, { status: stop ? 402 : 200 });
}
