import { NextResponse } from "next/server";
import { csvResponse, toCsv } from "@/lib/reports/csv";
import { getOwnerSession } from "@/lib/auth/owner-session";
import {
  groupLabel,
  loadPnl,
  loadPnlContext,
  monthLabel,
  rangeLabel,
  resolvePeriod,
  statementLines,
  vatLabel,
} from "@/lib/reports/pnl";

export const runtime = "nodejs";

const r2 = (n: number) => Math.round(n * 100) / 100 || 0;
/** Plain ASCII so spreadsheets read it as a percentage. */
const pct = (x: number | null) => (x == null || !Number.isFinite(x) ? "" : `${(Math.round(x * 1000) / 10 || 0).toFixed(1)}%`);

/** Profit & loss statement for `m=YYYY-MM` or `from`/`to` (same lines as /owner/reports). */
export async function GET(request: Request) {
  const sess = await getOwnerSession();
  if (!sess) return NextResponse.json({ error: "unauth" }, { status: 401 });

  try {
    const url = new URL(request.url);
    const ctx = await loadPnlContext();
    const period = resolvePeriod(
      { m: url.searchParams.get("m"), from: url.searchParams.get("from"), to: url.searchParams.get("to") },
      ctx.today,
    );
    const p = await loadPnl(period.from, period.to, ctx);
    const label = period.kind === "month" && period.month ? monthLabel(period.month, "en") : rangeLabel(period.from, period.to, "en", true);

    const rows: (string | number)[][] = [
      ["Strow - Profit & loss"],
      ["Period", label],
      ["From", period.from],
      ["To", period.to],
      ["Days counted", `${p.daysCovered} of ${p.daysInPeriod}`],
      ["VAT rate", vatLabel(p.vatRate)],
      [],
      ["Line", "AED", "% of net sales"],
      ...statementLines(p, "en").map((l) => [l.label, r2(l.amount), pct(l.pct)]),
      [],
      ["Bills by category (before VAT)", "AED", "Bills", "P&L line"],
      ...p.purchases.byCategory.map((c) => [c.name ?? "Uncategorized", r2(c.amount), c.count, groupLabel(c.group, "en")]),
      [],
      ["Not counted yet"],
      ["Sales through apps (commission not deducted)", r2(p.apps.total), pct(p.apps.share)],
    ];

    const filename = `strow-pnl-${period.from}-to-${period.to}.csv`;
    // BOM so Excel reads the Arabic category names as UTF-8.
    return csvResponse(filename, `﻿${toCsv(rows)}`);
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
