/**
 * Supplier contact hygiene shared by the bill reader and the submit action.
 * Qave's own phones/emails live in the database (locations.own_contacts),
 * never in code — this repo is public.
 */

export type OwnContacts = { phones: string[]; emails: string[] };

/** Last 9 digits: "+971 55 252 6497", "055-2526497", "00971552526497" all match. */
export function phoneKey(p: string | null | undefined): string {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : d;
}

export function isOwnPhone(p: string | null | undefined, own: OwnContacts | null | undefined): boolean {
  const k = phoneKey(p);
  return !!k && (own?.phones ?? []).some((x) => phoneKey(x) === k);
}

export function isOwnEmail(e: string | null | undefined, own: OwnContacts | null | undefined): boolean {
  const k = (e ?? "").trim().toLowerCase();
  return !!k && (own?.emails ?? []).some((x) => x.trim().toLowerCase() === k);
}

/** A bill may print several numbers: keep only the ones that aren't ours. */
export function scrubPhones(p: string | null | undefined, own: OwnContacts | null | undefined): string | null {
  if (!p) return null;
  const parts = p.split(/[,/;|]| or /i).map((x) => x.trim()).filter(Boolean);
  const kept = parts.filter((x) => phoneKey(x).length >= 7 && !isOwnPhone(x, own));
  return kept.length ? kept.join(", ") : null;
}

/** UAE TRNs are exactly 15 digits. Returns the digits or null + a reason. */
export function checkTrn(raw: string | null | undefined): { trn: string | null; problem: string | null } {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return { trn: null, problem: null };
  if (d.length !== 15) return { trn: null, problem: `TRN on the bill has ${d.length} digits (should be 15) — not saved` };
  return { trn: d, problem: null };
}
