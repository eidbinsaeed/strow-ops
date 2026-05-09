import { fetchExpenses, groupByCategory, sumExpenses } from "@/lib/reports/queries";
import { csvResponse, toCsv } from "@/lib/reports/csv";
import { currentMonth, parsePeriod } from "@/lib/reports/period";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params: Record<string, string | undefined> = {};
  url.searchParams.forEach((v, k) => (params[k] = v));
  const period = parsePeriod(params, currentMonth());

  const expenses = await fetchExpenses(period.from, period.to);
  const byCat = groupByCategory(expenses);
  const e = sumExpenses(expenses);

  const rows: (string | number)[][] = [
    ["Strow Ops - Category Breakdown"],
    ["Period", period.label],
    [],
    ["Category", "Bills", "Total (AED)", "Share %"],
    ...byCat.map(
      (c) =>
        [
          c.name,
          c.count,
          c.total,
          e.total > 0 ? ((c.total / e.total) * 100).toFixed(2) : "0",
        ] as (string | number)[],
    ),
    ["Total", expenses.length, e.total, "100"],
  ];

  const filename = `strow-categories-${period.from}-to-${period.to}.csv`;
  return csvResponse(filename, toCsv(rows));
}
