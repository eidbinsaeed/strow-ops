/**
 * Owner session JWT - sign/verify helpers.
 *
 * Single-owner v1: the JWT just marks "this client passed PIN auth", no
 * per-owner identity yet. If multi-owner ever ships, expand the payload.
 */
import { SignJWT, jwtVerify } from "jose";

const OWNER_COOKIE = "strow_owner_session";
const OWNER_TTL = "12h";

export type OwnerSession = {
  kind: "owner";
};

function getSecretKey() {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) throw new Error("SESSION_JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signOwnerSession(): Promise<string> {
  const payload: OwnerSession = { kind: "owner" };
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(OWNER_TTL)
    .sign(getSecretKey());
}

export async function verifyOwnerSession(
  token: string,
): Promise<OwnerSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.kind !== "owner") return null;
    return { kind: "owner" };
  } catch {
    return null;
  }
}

export const OWNER_COOKIE_NAME = OWNER_COOKIE;
export const OWNER_COOKIE_MAX_AGE = 60 * 60 * 12;
