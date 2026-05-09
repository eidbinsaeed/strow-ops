/**
 * Translation helper. Pure function - works in both server and client code.
 *
 * Falls back to English if the AR translation is missing, then to the key
 * itself if the entry is missing entirely. Numbers stay in Latin digits;
 * formatting them is the caller's job (use Number.toLocaleString with
 * "en-AE" so "AED 555.00" looks the same in either locale).
 */

import { DICT, type DictKey, type Locale } from "./dict";

export function tr(key: DictKey, locale: Locale): string {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[locale] ?? entry.en ?? key;
}
