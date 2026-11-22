/**
 * Server-safe filter param parser. Used by server components that import
 * filter URL params; the matching <TableFilters> client component lives in
 * components/owner/TableFilters.tsx and reads/writes the same params.
 */

export type FilterParams = {
  q: string | null;
  from: string | null;
  to: string | null;
  statuses: string[];
};

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FilterParams {
  const q = first(searchParams.q)?.trim() || null;
  const from = first(searchParams.from)?.trim() || null;
  const to = first(searchParams.to)?.trim() || null;
  const statuses =
    first(searchParams.status)
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return { q, from, to, statuses };
}

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

// ─── Long lists (Bills, Closings) ────────────────────────────────────────────

/** A list shows this many rows at first; each "Load older" adds as many again. */
export const LIST_STEP = 200;
/** The most a list shows at once (one request to the database returns at most 1,000 rows). */
export const LIST_MAX = 1000;

/** How many rows to show (?show=): in steps of LIST_STEP, from LIST_STEP to LIST_MAX. */
export function parseShow(searchParams: Record<string, string | string[] | undefined>): number {
  const n = Number(first(searchParams.show));
  if (!Number.isFinite(n) || n <= LIST_STEP) return LIST_STEP;
  return Math.min(LIST_MAX, Math.ceil(n / LIST_STEP) * LIST_STEP);
}

/** The same address showing the next LIST_STEP rows as well (filters kept). */
export function olderHref(pathname: string, searchParams: Record<string, string | string[] | undefined>, show: number): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    const s = first(v);
    if (s && k !== "show") next.set(k, s);
  }
  next.set("show", String(Math.min(LIST_MAX, show + LIST_STEP)));
  return `${pathname}?${next.toString()}`;
}

/**
 * What someone typed, as a "contains" pattern for a search in the database
 * (ilike). % and _ are searched as typed, not as wildcards.
 */
export function containsPattern(text: string): string {
  return `%${text.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&")}%`;
}

/**
 * A value written for use inside .or(…): in quotes, so a comma, a bracket or
 * a quote in the text cannot break the filter.
 */
export function orValue(value: string): string {
  return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}
