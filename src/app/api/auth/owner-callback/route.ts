/**
 * Owner magic-link callback.
 *
 * Supabase Auth sends the user back here after they click their email link.
 * We exchange the one-time code for a session, then make sure the resulting
 * user actually belongs to the owner allowlist (defense in depth — Supabase
 * doesn't know about our allowlist, so a leaked link from a future allowlist
 * change shouldn't grant access).
 *
 * On success → redirect to /owner.
 * On failure → redirect to /owner/login?error=...
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/auth/owner-allowlist";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const errorDescription =
    url.searchParams.get("error_description") || url.searchParams.get("error");

  const loginUrl = url.clone();
  loginUrl.pathname = "/owner/login";
  loginUrl.search = "";

  if (errorDescription) {
    loginUrl.searchParams.set("error", errorDescription);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session?.user?.email) {
    loginUrl.searchParams.set("error", "exchange_failed");
    return NextResponse.redirect(loginUrl);
  }

  if (!isOwnerEmail(data.session.user.email)) {
    // Sign them out — they made it through Supabase but not our allowlist.
    await supabase.auth.signOut();
    loginUrl.searchParams.set("error", "not_authorized");
    return NextResponse.redirect(loginUrl);
  }

  const home = url.clone();
  home.pathname = "/owner";
  home.search = "";
  return NextResponse.redirect(home);
}
