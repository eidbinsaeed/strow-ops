import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/** The Monthly P&L now lives on /owner/reports (Profit & loss). Old links keep their period. */
export default async function MonthlyPnLRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    for (const v of Array.isArray(value) ? value : [value]) qs.append(key, v);
  }
  const query = qs.toString();
  redirect((query ? `/owner/reports?${query}` : "/owner/reports") as Route);
}
