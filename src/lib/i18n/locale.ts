/**
 * Locale resolution for the owner shell.
 *
 * Order of precedence:
 *   1. strow_lang cookie (set by the language toggle)
 *   2. Accept-Language header (auto-detect)
 *   3. fallback "en"
 *
 * Server-only - imports from next/headers.
 */

import { cookies, headers } from "next/headers";
import type { Locale } from "./dict";

export const LOCALE_COOKIE = "strow_lang";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get(LOCALE_COOKIE)?.value;
  if (cookieLang === "ar") return "ar";
  if (cookieLang === "en") return "en";

  const h = await headers();
  const accept = h.get("accept-language") ?? "";
  // Look for "ar" anywhere in the Accept-Language header (e.g. "ar-AE,ar;q=0.9,en;q=0.8")
  const wantsArabic = /\bar(\b|-)/i.test(accept);
  return wantsArabic ? "ar" : "en";
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
