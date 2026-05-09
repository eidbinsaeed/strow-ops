import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { OWNER_COOKIE_NAME } from "@/lib/auth/owner-jwt";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/owner/login";
  url.search = "";
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set(OWNER_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
