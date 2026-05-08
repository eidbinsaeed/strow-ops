import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/server";
import { signBaristaSession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let pin: string;
  try {
    const body = await request.json();
    pin = String(body?.pin ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "invalid_pin_format" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: baristas, error } = await supabase
    .from("baristas")
    .select("id, location_id, name, pin_hash")
    .eq("is_active", true)
    .eq("is_on_shift", true);

  if (error) {
    console.error("[barista-login] db error:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  for (const b of baristas ?? []) {
    if (await bcrypt.compare(pin, b.pin_hash)) {
      const token = await signBaristaSession({
        bid: b.id,
        lid: b.location_id,
        name: b.name,
      });
      const response = NextResponse.json({ ok: true, name: b.name });
      response.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return response;
    }
  }

  return NextResponse.json({ error: "invalid_pin" }, { status: 401 });
}
