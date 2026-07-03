import { NextResponse } from "next/server";
import { fetchSales, fetchExpenses, sumSales, sumExpenses } from "@/lib/reports/queries";
import { csvResponse, toCsv } from "@/lib/reports/csv";
import { currentQuarter, parsePeriod } from "@/lib/reports/period";
import { getOwnerSession } from "@/lib/auth/owner-session";

export const runtime = "nodejs";

const VAT_RATE = 0.05;

export async function GET(request: Request) {
  const sess = await getOwnerSession();
  if (!sess) return NextResponse.json({ error: "unauth" }, { status: 401 });

  try {
    const url = new URL(request.url);
    const params: Record<string, string | undefined> = {};
    url.searchParams.forEach((v, k) => (params[k] = v));
    const period = parsePeriod(params, currentQuarter());

    const [sales, expenses] = await Promise.all([
      fetchSales(period.from, period.to),
      fetchExpenses(period.from, period.to),
    ]);
    const s = sumSales(sales);
    const e = sumExpenses(expenses);
    const outputVat = s.grand - s.grand / (1 + VAT_RATE);
    const inputVat = e.vat;
    const net = outputVat - inputVat;

    const rows: (string | number)[][] = [
      ["Strow Ops - VAT Report (5% UAE)"],
      ["Period", period.label],
      [],
      ["Output VAT (sales)"],
      ["Total sales (incl. VAT)", s.grand],
      ["VAT-exclusive base", s.grand / (1 + VAT_RATE)],
      ["Output VAT", outputVat],
      [],
      ["Input VAT (purchases)"],
      ["Total purchases (incl. VAT)", e.total],
      ["Subtotal (excl. VAT)", e.subtotal],
      ["Input VAT", inputVat],
      [],
      ["Net VAT"],
      [net >= 0 ? "Payable to FTA" : "Refundable from FTA", Math.abs(net)],
    ];

    const filename = `strow-vat-${period.from}-to-${period.to}.csv`;
    return csvResponse(filename, toCsv(rows));
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
