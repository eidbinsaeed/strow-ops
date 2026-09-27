import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { getVapid } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  try {
    const { publicKey } = await getVapid();
    return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
