/**
 * Finds where a supplier's logo sits on one of its past bill photos, for the
 * "Find logos on past bills" button on the Vendors page. The server only asks
 * the AI for the box; the owner's browser cuts the logo out of the photo and
 * saves it. Each supplier is looked at once (suppliers.logo_checked_at), so a
 * photo is never paid for twice.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ImageBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { createServiceClient } from "@/lib/supabase/server";
import { downloadDriveFile } from "@/lib/drive/upload";
import { cleanLogoBox, type LogoBox } from "@/lib/logo-box";
import { addUsage, emptyUsage, logUsage, type Usage } from "./usage";

const MODELS = [process.env.STROW_AI_MODEL || "claude-sonnet-5", "claude-sonnet-4-6"];

export const LOGO_PROMPT = `This is a photo of a bill (an invoice or a receipt) that Qave Cafe received from a supplier.
Find the SUPPLIER's logo: the seller's printed brand mark — an emblem, a picture, or a stylised name — usually at the top of the bill.
It is NOT: Qave's own name or logo, a stamp or signature, a QR code or barcode, card or payment logos (Visa, Mastercard, Apple Pay), or a shop name typed in ordinary plain text.

Return ONLY this JSON, nothing else:
{"has_logo": true or false, "box": {"x": number, "y": number, "w": number, "h": number} or null, "confidence": "high" or "medium" or "low"}

box: the smallest rectangle around the whole logo, as fractions of the photo's width and height (0 to 1); x and y are its top-left corner. If there is no printed logo, has_logo is false and box is null.`;

export type LogoFind =
  | { status: "found"; box: LogoBox; photo: string; expenseId: string }
  | { status: "none" | "no_photo"; reason: string }
  | { status: "error"; reason: string };

type Bill = { id: string; photo_drive_url: string | null };

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
  return null;
}

/** Suppliers that have a bill photo but no logo yet and haven't been looked at. */
export async function suppliersToCheck(): Promise<{ id: string; name: string }[]> {
  const db = createServiceClient();
  const { data: sups } = await db.from("suppliers").select("id, name").is("logo_path", null).is("logo_checked_at", null).order("name");
  const list = (sups ?? []) as { id: string; name: string }[];
  if (!list.length) return [];
  const { data: bills } = await db
    .from("expenses")
    .select("supplier_id")
    .in("supplier_id", list.map((s) => s.id))
    .not("photo_drive_url", "is", null)
    .neq("status", "rejected")
    .range(0, 4999);
  const has = new Set(((bills ?? []) as { supplier_id: string }[]).map((b) => b.supplier_id));
  return list.filter((s) => has.has(s.id));
}

async function ask(client: Anthropic, mt: ImageBlockParam["source"]["media_type"], b64: string, usage: Map<string, Usage>): Promise<string> {
  for (const model of MODELS) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 200,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mt, data: b64 } }, { type: "text", text: LOGO_PROMPT }] }],
      });
      const u = usage.get(model) ?? emptyUsage();
      addUsage(u, (res as unknown as { usage?: unknown }).usage);
      usage.set(model, u);
      return res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = (e as { status?: number }).status;
      if (status === 404 || /not_found|model/i.test(msg)) continue;
      throw e;
    }
  }
  throw new Error("No model available");
}

export async function findLogoForSupplier(supplierId: string): Promise<LogoFind> {
  const db = createServiceClient();
  const { data } = await db
    .from("expenses")
    .select("id, photo_drive_url")
    .eq("supplier_id", supplierId)
    .not("photo_drive_url", "is", null)
    .neq("status", "rejected")
    .order("expense_date", { ascending: false })
    .limit(3);
  const bills = (data ?? []) as Bill[];
  const markChecked = () => db.from("suppliers").update({ logo_checked_at: new Date().toISOString() }).eq("id", supplierId);
  if (!bills.length) {
    await markChecked();
    return { status: "no_photo", reason: "No bill photo" };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const usage = new Map<string, Usage>();
  try {
    let looked = 0;
    for (const b of bills) {
      const fid = fileIdOf(b.photo_drive_url);
      if (!fid) continue;
      const file = await downloadDriveFile(fid);
      const mt = file ? mediaTypeOf(file.mimeType) : null;
      if (!file || !mt || file.bytes.length > 4_800_000) continue; // PDFs and odd files: try an older bill
      looked++;
      const text = await ask(client, mt, file.bytes.toString("base64"), usage);
      const a = text.indexOf("{");
      const z = text.lastIndexOf("}");
      let j: { has_logo?: boolean; box?: unknown; confidence?: string } = {};
      try {
        j = a >= 0 && z > a ? JSON.parse(text.slice(a, z + 1)) : {};
      } catch {
        j = {};
      }
      const box = j.has_logo && j.confidence !== "low" ? cleanLogoBox(j.box) : null;
      if (box) {
        await markChecked();
        return { status: "found", box, photo: `/api/bill-photo/${fid}`, expenseId: b.id };
      }
      if (looked >= 2) break; // two photos without a logo: this supplier's bills don't carry one
    }
    await markChecked();
    return { status: "none", reason: looked ? "No printed logo on its bills" : "Its bills are PDFs or can't be opened" };
  } catch (e) {
    return { status: "error", reason: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  } finally {
    for (const [model, u] of usage) await logUsage("photo-logo", model, u);
  }
}
