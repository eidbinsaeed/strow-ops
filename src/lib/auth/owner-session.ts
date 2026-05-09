/**
 * Owner session helper.
 *
 * Reads the owner session cookie minted by /api/auth/owner-login.
 * Used by:
 *   - middleware.ts to gate /owner/**
 *   - server actions to attribute audit log entries
 *
 * Single-owner v1: the cookie just proves the client passed PIN auth.
 * No per-owner identity yet - all owner audit entries record actor_type
 * "owner" with actor_id null until per-owner identity ships.
 */
import { cookies } from "next/headers";
import { verifyOwnerSession, OWNER_COOKIE_NAME } from "./owner-jwt";

export type OwnerSession = {
  kind: "owner";
};

export async function getOwnerSession(): Promise<OwnerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyOwnerSession(token);
}

/**
 * For audit log calls from owner-side mutations.
 * - Returns { id: null, type: "owner" } when signed in.
 * - Returns { id: null, type: "system" } when not (server actions invoked
 *   outside an authed session, e.g. callbacks). Once /owner/** is gated,
 *   the system branch shouldn't fire in practice.
 */
export async function getOwnerActor(): Promise<{
  id: string | null;
  type: "owner" | "system";
}> {
  const session = await getOwnerSession();
  if (session) return { id: null, type: "owner" };
  return { id: null, type: "system" };
}
