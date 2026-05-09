import { NextResponse } from "next/server";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let lang: string;
  try {
    const body = await request.json();
    lang = String(body?.lang ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (lang !== "en" && lang !== "ar") {
    return NextResponse.json({ error: "invalid_lang" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, lang });
  response.cookies.set(LOCALE_COOKIE, lang, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return response;
}
