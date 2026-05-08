/**
 * Browser-side Supabase client.
 *
 * Use this in client components ("use client") for queries that should run
 * with the user's session cookies. RLS applies.
 *
 * For server-side calls, use `@/lib/supabase/server` instead.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
