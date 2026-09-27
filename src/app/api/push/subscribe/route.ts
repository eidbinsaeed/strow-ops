import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { addSubscription, removeSubscription } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Save this phone for lock-screen alerts.
export async function POST(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ ok: false, error: "Sign in again" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return NextResponse.json({ ok: false, error: "Bad subscription" }, { status: 400 });
  try {
    await addSubscription({ endpoint, keys: { p256dh, auth } }, req.headers.get("user-agent"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Stop alerts on this phone.
export async function DELETE(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ ok: false, error: "Sign in again" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
  if (typeof body.endpoint !== "string") return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  await removeSubscription(body.endpoint).catch(() => {});
  return NextResponse.json({ ok: true });
}
