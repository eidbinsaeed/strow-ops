import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyBaristaSession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

const PROTECTED_PREFIXES = ["/home", "/close", "/expense"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyBaristaSession(token) : null;

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/home/:path*", "/close/:path*", "/expense/:path*"],
};
