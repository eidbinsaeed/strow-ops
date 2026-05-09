"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/auth/owner-allowlist";

export async function requestOwnerMagicLink(formData: FormData) {
  const emailRaw = String(formData.get("email") ?? "").trim();
  const email = emailRaw.toLowerCase();

  // Surface the same generic confirmation regardless of allowlist outcome —
  // we don't want to leak which emails are allowed.
  const SAFE_RESPONSE = {
    ok: true,
    message:
      "If that email is on the allowlist, a sign-in link is on its way. Check your inbox.",
  };

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email" };
  }

  if (!isOwnerEmail(email)) {
    // Don't reveal allowlist contents. Just pretend we sent it.
    return SAFE_RESPONSE;
  }

  // Build the absolute redirect URL Supabase needs for the magic link callback.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${proto}://${host}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/api/auth/owner-callback`,
      // Allow Supabase to auto-create the auth user if first-time sign-in.
      shouldCreateUser: true,
    },
  });

  if (error) {
    // Log server-side, surface generic message to client.
    // eslint-disable-next-line no-console
    console.error("[owner-login] signInWithOtp:", error.message);
    return { error: "Could not send the sign-in link. Try again." };
  }

  return SAFE_RESPONSE;
}
