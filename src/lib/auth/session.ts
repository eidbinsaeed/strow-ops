/**
 * Read the current barista session from the request cookies.
 */
import { cookies } from "next/headers";
import { verifyBaristaSession, SESSION_COOKIE_NAME } from "./jwt";
import type { BaristaSession } from "./jwt";

export async function getBaristaSession(): Promise<BaristaSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyBaristaSession(token);
}
