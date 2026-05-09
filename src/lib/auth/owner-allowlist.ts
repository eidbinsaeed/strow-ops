/**
 * Owner email allowlist.
 *
 * Magic-link sign-in is gated by this list — if the requester's email isn't
 * here, we silently ignore the request (we don't reveal whether an email is
 * allowed or not, to prevent enumeration). The allowlist is passed via the
 * OWNER_EMAILS env var as a comma-separated list.
 *
 * Example:
 *   OWNER_EMAILS=eid@example.com, partner@example.com
 *
 * Defensive default: an empty allowlist denies everyone. If you forget to set
 * the env var, no one gets in — including you. Better that than open auth.
 */

export function getOwnerAllowlist(): string[] {
  const raw = process.env.OWNER_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string): boolean {
  const list = getOwnerAllowlist();
  return list.includes(email.trim().toLowerCase());
}
