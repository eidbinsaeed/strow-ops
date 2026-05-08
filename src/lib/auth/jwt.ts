/**
 * Barista session JWT — sign/verify helpers.
 * Edge-runtime compatible (uses jose, not jsonwebtoken).
 */
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "strow_session";
const SESSION_TTL = "12h";

export type BaristaSession = {
  bid: string;
  lid: string;
  name: string;
};

function getSecretKey() {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) throw new Error("SESSION_JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signBaristaSession(payload: BaristaSession): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecretKey());
}

export async function verifyBaristaSession(token: string): Promise<BaristaSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.bid !== "string" ||
      typeof payload.lid !== "string" ||
      typeof payload.name !== "string"
    ) {
      return null;
    }
    return { bid: payload.bid, lid: payload.lid, name: payload.name };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
