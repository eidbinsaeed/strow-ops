import { NextResponse } from "next/server";
import {
  signOwnerSession,
  OWNER_COOKIE_NAME,
  OWNER_COOKIE_MAX_AGE,
} from "@/lib/auth/owner-jwt";

export const runtime = "nodejs";

/**
 * Owner sign-in via PIN.
 *
 * The PIN is set via the OWNER_PIN env var. Comparison is constant-time
 * (single env value compared with the submitted PIN) to avoid trivial
 * timing oracles on a 4-8 digit string.
 *
 * On success: mints the owner session cookie. On failure: 401.
 */
export async function POST(request: Request) {
  let pin: string;
  try {
    const body = await request.json();
    pin = String(body?.pin ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: "invalid_pin_format" }, { status: 400 });
  }

  const expected = process.env.OWNER_PIN;
  if (!expected) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!constantTimeEquals(pin, expected)) {
    return NextResponse.json({ error: "invalid_pin" }, { status: 401 });
  }

  const token = await signOwnerSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OWNER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OWNER_COOKIE_MAX_AGE,
  });
  return response;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
