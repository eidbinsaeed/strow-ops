/**
 * Owner session helper — reads the current owner from Supabase Auth.
 *
 * Used by:
 *   - middleware.ts to gate /owner/**
 *   - server actions to attribute audit log entries to the right owner
 */
import { createClient } from "@/lib/supabase/server";

export type OwnerSession = {
  id: string;
  email: string;
};

export async function getOwnerSession(): Promise<OwnerSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;
  return { id: user.id, email: user.email };
}

/**
 * For audit log calls from owner-side mutations.
 *
 * Returns `{ id, type: 'owner' }` if signed in.
 * Returns `{ id: null, type: 'system' }` otherwise — used as a transitional
 * fallback while owner auth is being wired in. Once /owner/** is gated, the
 * `null` branch should never fire in practice.
 */
export async function getOwnerActor(): Promise<{
  id: string | null;
  type: "owner" | "system";
}> {
  const session = await getOwnerSession();
  if (session) return { id: session.id, type: "owner" };
  return { id: null, type: "system" };
}
