import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { todayDubai } from "@/lib/dates";
import { loadVatReturn, quartersSince } from "@/lib/reports/vat";
import { vatWorkbook } from "@/lib/reports/vat-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET ?from&to (default: the last finished quarter) → the VAT return as .xlsx. */
export async function GET(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const url = new URL(req.url);
  const today = todayDubai();
  const qs = quartersSince("2026-05-01", today);
  const q = qs.find((x) => x.done) ?? qs[0];
  const from = DATE.test(url.searchParams.get("from") ?? "") ? (url.searchParams.get("from") as string) : q.from;
  const to = DATE.test(url.searchParams.get("to") ?? "") ? (url.searchParams.get("to") as string) : q.to;
  const buf = await vatWorkbook(await loadVatReturn(from, to, today));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="qave-vat-${from}-to-${to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
