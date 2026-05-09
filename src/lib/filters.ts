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
