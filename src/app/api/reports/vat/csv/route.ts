import { NextResponse } from "next/server";
import { csvResponse, toCsv } from "@/lib/reports/csv";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { todayDubai } from "@/lib/dates";
import { loadVatReturn, quartersSince } from "@/lib/reports/vat";

export const runtime = "nodejs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The VAT 201 boxes as CSV (same numbers as the VAT page and its Excel file). */
export async function GET(request: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const today = todayDubai();
    const qs = quartersSince("2026-05-01", today);
    const q = qs.find((x) => x.done) ?? qs[0];
    const from = DATE.test(url.searchParams.get("from") ?? "") ? (url.searchParams.get("from") as string) : q.from;
    const to = DATE.test(url.searchParams.get("to") ?? "") ? (url.searchParams.get("to") as string) : q.to;
    const v = await loadVatReturn(from, to, today);
    const rows: (string | number)[][] = [
      ["Qave Cafe - VAT return"],
      ["Period", `${from} to ${to}`],
      ["Due", v.due],
      [],
      ["Box", "Description", "Amount (AED)", "VAT (AED)"],
      ["1a", "Standard rated supplies in Abu Dhabi", v.boxes.b1aAmount, v.boxes.b1aVat],
      ["9", "Standard rated expenses (bills with a supplier TRN)", v.boxes.b9Amount, v.boxes.b9Vat],
      ["12", "Total value of due tax", "", v.boxes.b12],
      ["13", "Total value of recoverable tax", "", v.boxes.b13],
      ["14", v.boxes.b14 >= 0 ? "Payable tax for the period" : "Refundable tax for the period", "", Math.abs(v.boxes.b14)],
    ];
    return csvResponse(`qave-vat-${from}-to-${to}.csv`, toCsv(rows));
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
