/**
 * Reads the order count (POS "Transactions") off past closing photos — once per
 * photo — and fills closings.transactions / transactions_by_method only when the
 * photo provably belongs to that day (its sales total equals the saved closing)
 * and the counts add up. Anything unclear is kept in closing_order_scans for the
 * owner to accept with one tap. Never overwrites a count that's already there.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ImageBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { createServiceClient } from "@/lib/supabase/server";
import { downloadDriveFile } from "@/lib/drive/upload";
import { todayDubai } from "@/lib/dates";
import { addUsage, emptyUsage, logUsage, type Usage } from "./usage";

const MODELS = [process.env.STROW_AI_MODEL || "claude-sonnet-5", "claude-sonnet-4-6"];
const METHODS = ["cash", "card", "talabat", "keeta", "beanz", "other"] as const;

export type ScanOutcome = { id: string; date: string; status: "filled" | "not_pos" | "check" | "error"; reason?: string | null; transactions?: number | null };
type Row = { id: string; closing_date: string; grand_total: number | string; photo_drive_url: string | null };

const PROMPT = `This photo is from Qave Cafe's end-of-day close. Usually it is the POS "Payment Methods" report: one row per payment method (Beanz, Card, Kaeeta/Keeta, Talabat, Cash) with a "Transactions" column (a COUNT of orders) and a "Total Sales" column (money), plus totals at the top ("Total Transactions", "Total Sales"). Sometimes it is a handwritten sheet instead.

Return ONLY this JSON, nothing else:
{"is_pos_report": true or false,
 "total_transactions": integer or null,
 "by_method": {"cash": int, "card": int, "talabat": int, "keeta": int, "beanz": int, "other": int} or null,
 "total_sales": number or null,
 "confidence": "high" or "medium" or "low",
 "note": "one short line, only if something is unclear"}

Rules: transactions are counts, never money. "Kaeeta"/"Keta" = keeta. A method with no row had no orders, so 0. total_sales is the report's overall sales total in AED. If it is not a POS report, or the counts can't be read, use null for them. Say "high" only if every number is clearly readable.`;

function fileIdOf(url: string | null): string | null {
  if (!url) return null;
  const m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(url) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(url);
  return m ? m[1] : null;
}
function mediaTypeOf(m: string): ImageBlockParam["source"]["media_type"] | null {
  const t = m.toLowerCase();
  if (t.includes("jpeg") || t.includes("jpg")) return "image/jpeg";
  if (t.includes("png")) return "image/png";
  if (t.includes("webp")) return "image/webp";
  if (t.includes("gif")) return "image/gif";
  return null;
}
function sinceDate(days: number): string {
  return new Date(Date.parse(`${todayDubai()}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

async function candidates(days: number | null, exclude: string[]): Promise<Row[]> {
  const db = createServiceClient();
  const { data: scanned } = await db.from("closing_order_scans").select("closing_id").in("status", ["filled", "not_pos", "check"]).range(0, 19999);
  const skip = new Set([...((scanned ?? []) as { closing_id: string }[]).map((r) => r.closing_id), ...exclude]);
  let q = db
    .from("closings")
    .select("id, closing_date, grand_total, photo_drive_url")
    .is("transactions", null)
    .neq("status", "rejected")
    .not("photo_drive_url", "is", null)
    .order("closing_date", { ascending: false })
    .range(0, 1999);
  if (days) q = q.gte("closing_date", sinceDate(days));
  const { data } = await q;
  return ((data ?? []) as Row[]).filter((r) => !skip.has(r.id));
}

export async function countPending(days: number | null): Promise<number> {
  return (await candidates(days, [])).length;
}

class OutOfCredit extends Error {}

async function readOne(row: Row, usage: Map<string, Usage>): Promise<ScanOutcome> {
  const db = createServiceClient();
  const out = async (status: ScanOutcome["status"], reason: string | null, read: Record<string, unknown> | null, tx: number | null = null): Promise<ScanOutcome> => {
    await db.from("closing_order_scans").upsert({ closing_id: row.id, status, reason, read, scanned_at: new Date().toISOString() });
    return { id: row.id, date: row.closing_date, status, reason, transactions: tx };
  };
  const fid = fileIdOf(row.photo_drive_url);
  if (!fid) return out("error", "No photo link", null);
  const file = await downloadDriveFile(fid);
  if (!file) return out("error", "Couldn't download the photo from Drive", null);
  const mt = mediaTypeOf(file.mimeType);
  if (!mt) return out("error", `Unsupported photo type ${file.mimeType}`, null);
  if (file.bytes.length > 4_800_000) return out("error", "Photo too large", null);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let text = "";
  let used = "";
  for (const model of MODELS) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mt, data: file.bytes.toString("base64") } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      });
      const u = usage.get(model) ?? emptyUsage();
      addUsage(u, (res as unknown as { usage?: unknown }).usage);
      usage.set(model, u);
      text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      used = model;
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/credit balance/i.test(msg)) throw new OutOfCredit(msg);
      const status = (e as { status?: number }).status;
      if (status === 404 || /not_found|model/i.test(msg)) continue;
      return out("error", msg.slice(0, 200), null);
    }
  }
  if (!used) return out("error", "No model available", null);

  let read: Record<string, unknown>;
  try {
    const j = text.replace(/```json|```/g, "");
    read = JSON.parse(j.slice(j.indexOf("{"), j.lastIndexOf("}") + 1)) as Record<string, unknown>;
  } catch {
    return out("error", "Couldn't understand the AI's answer", { raw: text.slice(0, 300) });
  }
  const txRaw = Number(read.total_transactions);
  const tx = read.total_transactions != null && Number.isFinite(txRaw) && txRaw >= 0 ? Math.round(txRaw) : null;
  let by: Record<string, number> | null = null;
  if (read.by_method && typeof read.by_method === "object") {
    by = {};
    for (const k of METHODS) {
      const v = (read.by_method as Record<string, unknown>)[k];
      const n = Number(v);
      if (v != null && Number.isFinite(n) && n >= 0) by[k] = Math.round(n);
    }
    if (!Object.keys(by).length) by = null;
  }
  const salesRaw = Number(read.total_sales);
  const sales = read.total_sales != null && Number.isFinite(salesRaw) ? salesRaw : null;
  const saved = Number(row.grand_total) || 0;
  const sum = by ? Object.values(by).reduce((a, b) => a + b, 0) : null;
  const note = typeof read.note === "string" && read.note.trim() ? read.note.trim().slice(0, 160) : null;
  const facts = { transactions: tx, by_method: by, total_sales: sales, confidence: read.confidence ?? null, note, model: used };

  if (read.is_pos_report === false) return out("not_pos", "Handwritten sheet — no order count on it", facts);
  if (tx == null) return out("check", "Couldn't read the order count", facts);
  if (sum != null && sum !== tx) return out("check", `Methods add up to ${sum} orders but the total says ${tx}`, facts, tx);
  if (sales == null) return out("check", "Couldn't read the photo's sales total to confirm the day", facts, tx);
  if (Math.abs(sales - saved) > 1) return out("check", `Photo total AED ${sales.toLocaleString("en-US")} ≠ saved AED ${saved.toLocaleString("en-US")}`, facts, tx);
  if (read.confidence !== "high") return out("check", note ? `Not fully sure: ${note}` : "Not fully sure of the numbers", facts, tx);

  const { error } = await db.from("closings").update({ transactions: tx, transactions_by_method: by }).eq("id", row.id).is("transactions", null);
  if (error) return out("error", error.message, facts, tx);
  return out("filled", null, facts, tx);
}

/** Reads up to `max` photos (3 at a time) and reports what's left. */
export async function runOrdersBackfill(opts: { days: number | null; max?: number; exclude?: string[] }): Promise<{ outcomes: ScanOutcome[]; remaining: number; error?: string }> {
  const rows = (await candidates(opts.days, opts.exclude ?? [])).slice(0, opts.max ?? 6);
  const usage = new Map<string, Usage>();
  const outcomes: ScanOutcome[] = [];
  let error: string | undefined;
  try {
    for (let i = 0; i < rows.length; i += 3) outcomes.push(...(await Promise.all(rows.slice(i, i + 3).map((r) => readOne(r, usage)))));
  } catch (e) {
    error = e instanceof OutOfCredit ? "The AI account is out of credit — top up the Anthropic balance and try again." : e instanceof Error ? e.message : String(e);
  } finally {
    for (const [model, u] of usage) await logUsage("backfill-orders", model, u);
  }
  return { outcomes, remaining: (await candidates(opts.days, opts.exclude ?? [])).length, error };
}
