import {
  fetchSales,
  fetchExpenses,
  sumSales,
  sumExpenses,
  groupByCategory,
} from "@/lib/reports/queries";
import { csvResponse, toCsv } from "@/lib/reports/csv";
import { currentMonth, parsePeriod } from "@/lib/reports/period";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params: Record<string, string | undefined> = {};
  url.searchParams.forEach((v, k) => (params[k] = v));
  const period = parsePeriod(params, currentMonth());

  const [sales, expenses] = await Promise.all([
    fetchSales(period.from, period.to),
    fetchExpenses(period.from, period.to),
  ]);
  const s = sumSales(sales);
  const e = sumExpenses(expenses);
  const byCat = groupByCategory(expenses);
  const grossMargin = s.grand - e.total;

  const rows: (string | number)[][] = [
    ["Strow Ops - Monthly P&L"],
    ["Period", period.label],
    ["From", period.from],
    ["To", period.to],
    [],
    ["Sales"],
    ["Cash", s.cash],
    ["Card", s.card],
    ["Online", s.online],
    ["Total sales", s.grand],
    [],
    ["Purchases by category"],
    ...byCat.map((c) => [c.name, c.total] as (string | number)[]),
    ["Total purchases", e.total],
    [],
    ["Gross margin", grossMargin],
    [
      "Margin %",
      s.grand > 0 ? `${((grossMargin / s.grand) * 100).toFixed(2)}%` : "n/a",
    ],
  ];

  const filename = `strow-pnl-${period.from}-to-${period.to}.csv`;
  return csvResponse(filename, toCsv(rows));
}
