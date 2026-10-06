/**
 * POST /api/pos/import — the owner uploads one EZI POS daily report (.xlsx).
 *
 * Body: the raw file bytes. Header x-file-name: the file name (URI-encoded).
 * The file is parsed here (src/lib/pos/parse-report.ts, the TypeScript twin of
 * scripts/pos_report.py) and imported with public.pos_import_report — the same
 * function the daily email import uses. msg is null, so the database records the
 * report's source as "upload". The business date comes from the report itself.
 *
 * Responds { ok: true, file, date, status, orders, total_paid, closing_state,
 * new_menu_items, prices_filled, warnings } or { ok: false, file, reason }.
 * A bad file is never a 500.
 */
import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";
import { todayDubai } from "@/lib/dates";
import { parsePosReport } from "@/lib/pos/parse-report";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
/** Reports older than this many days import quietly: no "Needs you" items for long-gone days. */
const QUIET_AFTER_DAYS = 2;

export type PosImportResult =
  | {
      ok: true;
      file: string;
      date: string;
      status: "imported" | "replaced" | "skipped";
      orders: number;
      total_paid: number;
      closing_state: string | null;
      new_menu_items: number;
      prices_filled: number;
      warnings: string[];
      /** Only when skipped: why (already imported, or a newer report is there). */
      reason?: string;
    }
  | { ok: false; file: string; reason: string };

function fileName(req: Request): string {
  const raw = req.headers.get("x-file-name");
  if (!raw) return "report.xlsx";
  try {
    return decodeURIComponent(raw).slice(0, 200);
  } catch {
    return raw.slice(0, 200);
  }
}

/** Whole days from a to b (YYYY-MM-DD), or null if either is not a plain date. */
function daysBetween(a: string, b: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const d = (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(d) ? Math.round(d) : null;
}

/** A count from the rpc result: a number, a list (its length) or missing (older database versions). */
function count(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fail(file: string, reason: string, status: number) {
  return NextResponse.json({ ok: false, file, reason } satisfies PosImportResult, { status });
}

export async function POST(req: Request) {
  const file = fileName(req);
  const s = await getOwnerSession();
  if (!s) return fail(file, "Not signed in. Log in again and retry.", 401);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return fail(file, "file is larger than 5 MB (a daily report is much smaller)", 413);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await req.arrayBuffer());
  } catch {
    return fail(file, "the upload did not arrive completely, try again", 400);
  }
  if (bytes.length > MAX_BYTES) return fail(file, "file is larger than 5 MB (a daily report is much smaller)", 413);
  if (!bytes.length) return fail(file, "empty file", 400);

  const parsed = parsePosReport(bytes, { msgId: null });
  if (!parsed.ok) return fail(file, parsed.reason, 422);

  const { summary } = parsed;
  // chk is already in the payload; `quiet` is a boolean, which the database checksum does not count.
  const age = daysBetween(summary.date, todayDubai());
  const payload = age !== null && age > QUIET_AFTER_DAYS ? { ...parsed.payload, quiet: true } : parsed.payload;

  let data: unknown;
  try {
    const res = await createServiceClient().rpc("pos_import_report", { p: payload });
    if (res.error) return fail(file, res.error.message.replace(/^pos_import_report:\s*/, ""), 422);
    data = res.data;
  } catch (e) {
    return fail(file, `could not reach the database (${e instanceof Error ? e.message : String(e)})`, 503);
  }

  const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const status = r.status === "replaced" || r.status === "skipped" ? r.status : "imported";
  const closing = r.closing && typeof r.closing === "object" ? (r.closing as Record<string, unknown>) : null;
  const result: PosImportResult = {
    ok: true,
    file,
    date: typeof r.date === "string" ? r.date : summary.date,
    status,
    // A skipped report returns no totals; show what the file says.
    orders: r.orders != null && Number.isFinite(Number(r.orders)) ? Number(r.orders) : summary.orders,
    total_paid: r.total_paid != null && Number.isFinite(Number(r.total_paid)) ? Number(r.total_paid) : summary.paid,
    closing_state: typeof closing?.state === "string" ? closing.state : null,
    new_menu_items: count(r.new_menu_items),
    prices_filled: count(r.prices_filled),
    warnings: Array.isArray(r.warnings) ? r.warnings.map(String) : summary.warnings,
    ...(status === "skipped" && typeof r.reason === "string" ? { reason: r.reason } : {}),
  };
  return NextResponse.json(result);
}
