import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { verifyBaristaSession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

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

  if (
    pathname.startsWith(OWNER_PROTECTED_PREFIX) &&
    !OWNER_PUBLIC_SUBPATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    )
  ) {
    const response = NextResponse.next({
      request: { headers: request.headers },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options: CookieOptions;
            }[],
          ) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/owner/login";
      url.search = "";
      return NextResponse.redirect(url);
    }

    return response;
  }

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
