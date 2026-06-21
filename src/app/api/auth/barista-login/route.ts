import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/server";
import { signBaristaSession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

export const runtime = "nodejs";

/**
 * Staff sign-in: ID code + password.
 *
 * The ID code identifies the person; the password is the secret (stored as a
 * bcrypt hash in baristas.pin_hash). We never reveal which of the two was wrong.
 */
export async function POST(request: Request) {
  let code: string;
  let password: string;
  try {
    const body = await request.json();
    code = String(body?.code ?? "").trim();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // ID code is numeric; password is 4-72 chars (bcrypt limit).
  if (!/^\d{3,6}$/.test(code) || password.length < 4 || password.length > 72) {
    return NextResponse.json({ error: "invalid_login" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: barista, error } = await supabase
    .from("baristas")
    .select("id, location_id, name, pin_hash")
    .eq("employee_code", code)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[barista-login] db error:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (barista && (await bcrypt.compare(password, barista.pin_hash))) {
    const token = await signBaristaSession({
      bid: barista.id,
      lid: barista.location_id,
      name: barista.name,
    });
    const response = NextResponse.json({ ok: true, name: barista.name });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  }

  return NextResponse.json({ error: "invalid_login" }, { status: 401 });
}
