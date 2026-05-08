/**
 * Server-side Supabase client.
 *
 * Reads/writes Supabase session cookies via Next.js cookies() API.
 * Use this in:
 *   - Server Components
 *   - Route handlers (app/api/.../route.ts)
 *   - Server Actions
 *
 * For elevated operations that bypass RLS (system jobs, the Drive sync
 * worker, the AI extraction callback), use createServiceClient() instead.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Standard server client — respects user session, RLS applies.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Setting cookies from a Server Component is allowed but no-op
            // when invoked outside a route handler. Middleware handles
            // session refresh in those cases.
          }
        },
      },
    },
  );
}

/**
 * Service-role client — bypasses RLS. Server-only, never reaches the client.
 *
 * Use ONLY for:
 *   - System jobs (Drive sync worker)
 *   - AI extraction callback writes
 *   - Owner-initiated admin actions that legitimately need bypass
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
