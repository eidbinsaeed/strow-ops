import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyBaristaSession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { verifyOwnerSession, OWNER_COOKIE_NAME } from "@/lib/auth/owner-jwt";

const BARISTA_PROTECTED_PREFIXES = [
  "/home",
  "/close",
  "/expense",
  "/today",
];

const OWNER_PROTECTED_PREFIX = "/owner";
const OWNER_PUBLIC_SUBPATHS = ["/owner/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Owner gate (custom JWT cookie)
  if (
    pathname.startsWith(OWNER_PROTECTED_PREFIX) &&
    !OWNER_PUBLIC_SUBPATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    )
  ) {
    const token = request.cookies.get(OWNER_COOKIE_NAME)?.value;
    const session = token ? await verifyOwnerSession(token) : null;
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/owner/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Barista gate (custom JWT)
  const needsBaristaAuth = BARISTA_PROTECTED_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );
  if (needsBaristaAuth) {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifyBaristaSession(token) : null;
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/home/:path*",
    "/close/:path*",
    "/expense/:path*",
    "/today/:path*",
    "/owner/:path*",
  ],
};
