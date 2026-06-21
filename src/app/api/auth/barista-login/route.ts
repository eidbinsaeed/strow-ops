import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/server";
import { signBaristaSession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

export const runtime = "nodejs";

/**
 * Staff sign-in: ID code + PIN.
 *
 * The employee's structured ID code (e.g. 1101) identifies the person; the
 * 4-digit PIN is the secret. We never reveal which of the two was wrong.
 */
export async function POST(request: Request) {
  let code: string;
  let pin: string;
  try {
    const body = await request.json();
    code = String(body?.code ?? "").trim();
    pin = String(body?.pin ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Codes are numeric (4 digits today); PIN is exactly 4 digits.
  if (!/^\d{3,6}$/.test(code) || !/^\d{4}$/.test(pin)) {
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

  if (barista && (await bcrypt.compare(pin, barista.pin_hash))) {
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
