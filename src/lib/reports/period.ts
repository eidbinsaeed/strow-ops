/**
 * Period helpers for reports. All periods are in Asia/Dubai local time
 * since closing_date / expense_date are stored as DATE in Supabase.
 */

export type Period = { from: string; to: string; label: string };

function todayInDubai(): Date {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  return new Date(s + "T00:00:00");
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function currentMonth(): Period {
  const d = todayInDubai();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const from = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
  const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-AE", {
    month: "long",
    year: "numeric",
  });
  return { from, to, label };
}

export function currentQuarter(): Period {
  const d = todayInDubai();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const qStartMonth = Math.floor(month / 3) * 3;
  const qNumber = qStartMonth / 3 + 1;
  const from = `${year}-${pad(qStartMonth + 1)}-01`;
  const lastDay = new Date(Date.UTC(year, qStartMonth + 3, 0)).getUTCDate();
  const to = `${year}-${pad(qStartMonth + 3)}-${pad(lastDay)}`;
  return { from, to, label: `Q${qNumber} ${year}` };
}

/**
 * Parse `from` and `to` from URL params. Falls back to the provided default.
 */
export function parsePeriod(
  searchParams: Record<string, string | undefined>,
  fallback: Period,
): Period {
  const from = searchParams.from?.trim();
  const to = searchParams.to?.trim();
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return {
      from,
      to,
      label: `${formatHuman(from)} - ${formatHuman(to)}`,
    };
  }
  return fallback;
}

function formatHuman(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
