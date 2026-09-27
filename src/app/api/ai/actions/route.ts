import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { decideAction } from "@/lib/ai/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ ok: false, error: "Sign in again" }, { status: 401 });
  let body: { id?: unknown; decision?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const id = String(body.id ?? "");
  const decision = String(body.decision ?? "");
  if (!UUID.test(id) || !["approve", "reject", "undo"].includes(decision)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const res = await decideAction(id, decision as "approve" | "reject" | "undo");
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
