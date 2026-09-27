import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  const res = await sendPush({
    title: "Strow alerts are on",
    body: "You'll get one like this when a barista uploads a closing or a bill.",
    url: "/owner",
    tag: "strow-test",
  });
  return NextResponse.json(res);
}
