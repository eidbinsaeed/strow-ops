/**
 * Shared inventory-matching helpers.
 *
 * `normalizeItemText` MUST stay in lockstep with the SQL `strow_norm()`
 * function (see migration `autolink_line_items_from_aliases`) and with the
 * `norm()` used when writing item_aliases — all three produce the same key
 * so a taught alias reliably matches a future receipt line.
 */

/** lowercase, trim, collapse internal whitespace. Mirrors SQL strow_norm(). */
export function normalizeItemText(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Text that should never be turned into a tracked inventory item on its own.
const JUNK = /\b(unknown|unreadable|illegible|handwritten|assorted|various|misc)\b/i;

/**
 * Guard for auto-creating an item from an AI suggestion. Keeps genuine
 * products, rejects noise ("unknown", "handwritten…", empty, placeholders).
 */
export function looksLikeRealItem(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (n.length < 2) return false;
  if (n === "(item)" || n === "(no description)") return false;
  if (JUNK.test(n)) return false;
  return true;
}
