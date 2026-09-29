import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

import { logResponseUsage } from "@/lib/ai/usage";
export const runtime = "nodejs";
export const maxDuration = 60;

// v2 extraction prompt — adds line-item extraction, inventory matching,
// per-field confidence, and an anomalies object for auto-routing to the
// owner review queue. The dynamic context (categories, suppliers, inventory,
// recent spend) is appended to the user message, not the system prompt.
const SYSTEM_PROMPT = `You extract structured data from photos of supplier invoices and cash receipts for Qave Cafe in Al Ain, UAE.

The photo is an expense receipt — a printed VAT invoice, a handwritten cash receipt, a delivery note, or a screenshot from a payment app. It may also be a digital PDF invoice (possibly several pages): read every page, take header fields (supplier, invoice number, date, totals) from wherever they appear, and collect line items across all pages without double-counting a carried-forward subtotal.

== EXTRACTION RULES ==
- The photo may be English, Arabic, or a mix. Numbers may be Western digits (0-9) OR Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩). Always normalize to Western digits in the output.
- Currency is AED. Strip currency symbols and commas; output bare numbers (e.g. 1234.50 not "AED 1,234.50").
- Dates: UAE convention is DD/MM/YYYY or DD-MM-YYYY. Be careful — 03/04/2026 is 3 April, not 4 March. Output ISO format YYYY-MM-DD.
- UAE VAT rate is 5%. If subtotal and total are both visible, vat_amount = total - subtotal. If only total is visible, leave vat_amount null (do NOT compute backwards — many small suppliers do not charge VAT).
- Supplier name: extract the business/seller name as printed. If the receipt says "Tax Invoice" or "Credit Note" at the top, the supplier is usually below that.
- Invoice number: any unique identifier on the receipt ("Invoice No", "Receipt #", "Ref", etc.).
- Payment method: infer from the receipt — "cash", "card", "bank_transfer", or "credit" (marked unpaid / on account).
- If a field is not visible or you cannot read it, return null. Do NOT guess.

== SUPPLIER & DOCUMENT DETAILS ==
Read the SELLER's details (never the "Bill To" / customer block — that is Qave Cafe itself):
- supplier_trn: the seller's TRN / Tax Registration Number (15 digits), digits only.
- supplier_address: seller address as printed, one line (city/emirate at least if that's all there is).
- supplier_phone: seller phone / mobile / WhatsApp as printed (keep the + and country code). Look in footers and notes too ("Contact Number: ...").
- supplier_email: seller email if printed (a salesperson email counts if no other).
- doc_type: "tax_invoice" | "sales_order" | "receipt" | "delivery_note" | "quotation" | "other" — from the document title.
- order_ref: customer reference / PO / "Ref#" if printed (NOT the invoice/order number itself), else null.
- salesperson: salesperson name/code/email if printed, else null.
- payment_terms: e.g. "cash", "cash on delivery", "30 days", as printed, else null.

== LINE ITEMS ==
Extract every line on the receipt into "line_items" (goods AND non-goods like delivery fees). For each line:
- description: the item text as printed, normalized to Western digits.
- quantity / unit_price / line_total: numbers. If only a line total is visible, set quantity 1 and unit_price = line_total. When the receipt separates discount and/or VAT (columns like ListVal, Disc, NetVal, VAT 5%), line_total is the NET amount — after discount and before VAT. Otherwise line_total is simply the amount shown for that line.
- discount: the per-line discount amount if the receipt itemizes one (e.g. a "Disc" column), else 0.
- vat_amount: the per-line VAT/tax amount if the receipt separates VAT per line, else 0. If VAT is shown only as a single total for the whole bill, keep per-line vat_amount 0 and report it in the top-level vat_amount instead.
- inventory_item_id: if the line clearly matches one of the KNOWN INVENTORY ITEMS listed below — same product, allowing for spelling, translation, or brand variants — return that item's exact id. Also consult KNOWN ALIASES below: if the line text equals or closely matches an alias's raw text, return that alias's item id. Otherwise null.
- suggested_item_name: when inventory_item_id is null, give a short canonical English name for the item (e.g. "Whole milk 1L", "Vanilla syrup", "Paper cups 8oz"). When you DID match an inventory item, return null.
- match_confidence: "high" | "medium" | "low" — your confidence in the inventory match, or in the quality of the suggested name.
- line_kind: "goods" for physical products; "fee" for delivery/shipping/service charges; "discount" for discount lines; "deposit" for bottle/crate deposits; "other" otherwise. Fees are NEVER inventory: set inventory_item_id null and suggested_item_name null for non-goods.
- brand: brand name if identifiable (e.g. "Oatly", "Alpro", "Almarai"), else null.
- uom_printed: the unit exactly as printed in the qty column ("pcs", "Lt", "Units", "CTN", "kg"), else null.

GOODS RECEIVED — describe what physically arrived for every goods line, in three layers:
  pack_qty × units_per_pack = count_qty individual units, each unit_size size_uom.
- count_qty / count_uom: how many INDIVIDUAL sellable units arrived and what they are — "carton", "bottle", "can", "bag", "pack", "tray", "jar", "tub", "loaf", "pcs"... For loose goods sold by weight/volume, count_qty is the amount and count_uom is the measure ("2.5" + "kg").
- unit_size / size_uom: content of ONE individual unit — "1" + "L", "750" + "ml", "1" + "kg", "500" + "g", "1" + "gal". Read it from the description ("1 kg", "(1x6)Ltr" means 6 × 1 L, "1 X 12 LT" means 12 × 1 L). null if the item has no size (a croissant).
- pack_qty / pack_type / units_per_pack: outer packaging if stated (e.g. "4 boxes" of 6 → 4, "box", 6). null if not stated.
- Cross-check with the money: quantity × unit_price should equal line_total — the billed quantity column tells you what the price is per. Sub-notes under the description (e.g. "4 boxes", "4pcs", "1Kg") are the supplier's packing notes; use them to fill packs, but if they contradict the billed qty, trust the billed qty and mention the conflict in "qty_note".
- qty_note: one short plain-English note if the quantity is ambiguous or the packing note conflicts with the billed quantity, else null.
- qty_confidence: "high" | "medium" | "low" — how sure you are about count/size.

Examples:
- "OATLY Barista Edition Milk (1x6)Ltr / 4 boxes", qty 24 pcs @ 12.50 → count_qty 24, count_uom "carton", unit_size 1, size_uom "L", pack_qty 4, pack_type "box", units_per_pack 6, brand "Oatly".
- "Frozen Blueberry Whole 1 kg", qty 1 pcs @ 60 → count_qty 1, count_uom "bag", unit_size 1, size_uom "kg".
- "CROISSANT PLAIN", 12 Units @ 8 → count_qty 12, count_uom "pcs", unit_size null.
- "Tomato", 2.35 KG @ 4.50 → count_qty 2.35, count_uom "kg", unit_size null.
- "Shipping fee" 35.00 → line_kind "fee", no quantities needed (count_qty 1, count_uom null).

If the receipt shows only a total with no itemized lines, return an empty array.

== CONFIDENCE ==
Self-rate each top-level field: "high" = clearly visible and unambiguous, "medium" = visible but partially unclear or requires interpretation, "low" = guessed from context or barely visible.

== ANOMALIES ==
Populate "anomalies" to flag anything that should pause this expense for owner review. Possible flags:
- "math_mismatch": subtotal + vat_amount does not equal total.
- "lines_dont_sum": the line_items totals do not add up to the subtotal or total.
- "future_date": expense_date is after today's date (given below).
- "unknown_supplier": the supplier is not in the KNOWN SUPPLIERS list below.
- "spend_outlier": the total is far outside this supplier's recent 30-day spending pattern (given below).
- "duplicate_invoice_suspected": the invoice number looks like one already recorded recently.
- "unreadable": one or more key fields could not be read with confidence.
Set has_anomaly to true if any flag fires. Put a one-line, plain-English explanation in "explanation" (or null if no anomaly).

Deliver the result by calling the record_bill tool with ONE object matching this schema. Do any checking silently — put nothing outside the tool call:

{
  "supplier_name": string | null,
  "supplier_trn": string | null,
  "supplier_address": string | null,
  "supplier_phone": string | null,
  "supplier_email": string | null,
  "doc_type": "tax_invoice" | "sales_order" | "receipt" | "delivery_note" | "quotation" | "other" | null,
  "order_ref": string | null,
  "salesperson": string | null,
  "payment_terms": string | null,
  "expense_date": "YYYY-MM-DD" | null,
  "invoice_number": string | null,
  "subtotal": number | null,
  "vat_amount": number | null,
  "total": number | null,
  "payment_method": "cash" | "card" | "bank_transfer" | "credit" | null,
  "category_hint": string | null,
  "notes": string | null,
  "line_items": [
    {
      "description": string,
      "quantity": number,
      "unit_price": number,
      "line_total": number,
      "discount": number,
      "vat_amount": number,
      "inventory_item_id": string | null,
      "suggested_item_name": string | null,
      "match_confidence": "high" | "medium" | "low",
      "line_kind": "goods" | "fee" | "discount" | "deposit" | "other",
      "brand": string | null,
      "uom_printed": string | null,
      "count_qty": number | null,
      "count_uom": string | null,
      "unit_size": number | null,
      "size_uom": string | null,
      "pack_qty": number | null,
      "pack_type": string | null,
      "units_per_pack": number | null,
      "vat_rate": number | null,
      "qty_note": string | null,
      "qty_confidence": "high" | "medium" | "low"
    }
  ],
  "confidence": {
    "supplier_name": "high" | "medium" | "low",
    "expense_date": "high" | "medium" | "low",
    "invoice_number": "high" | "medium" | "low",
    "subtotal": "high" | "medium" | "low",
    "vat_amount": "high" | "medium" | "low",
    "total": "high" | "medium" | "low",
    "payment_method": "high" | "medium" | "low"
  },
  "anomalies": {
    "has_anomaly": boolean,
    "flags": string[],
    "explanation": string | null
  }
}

For "category_hint", pick the most likely category NAME from the KNOWN CATEGORIES list below based on what was bought.

If the image is clearly NOT a receipt (random photo, blurry beyond recognition), return all data fields as null, line_items as [], every confidence "low", and anomalies with has_anomaly true, flags ["unreadable"], and a brief explanation in "notes".`;

const VALID_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type ValidMediaType = (typeof VALID_MEDIA_TYPES)[number];
const PDF_MEDIA_TYPE = "application/pdf";

type CategoryRow = { id: string; name: string };
type SupplierRow = { id: string; name: string; trn: string | null };
type InventoryRow = { id: string; name: string; unit: string | null };
type AliasRow = {
  raw_text: string;
  inventory_items: { id: string; name: string } | null;
};
type RecentExpenseRow = {
  supplier_id: string | null;
  total: number;
  suppliers: { name: string } | null;
};

/**
 * Builds the dynamic context block appended to the user message: the
 * location's active categories, suppliers, inventory items, and a 30-day
 * per-supplier spend summary. Gives the model what it needs to match line
 * items, suggest categories, and judge anomalies.
 */
function buildContextBlock(args: {
  today: string;
  categories: CategoryRow[];
  suppliers: SupplierRow[];
  inventory: InventoryRow[];
  recentExpenses: RecentExpenseRow[];
  aliases: AliasRow[];
}): string {
  const { today, categories, suppliers, inventory, recentExpenses, aliases } = args;

  const categoryList =
    categories.length > 0
      ? categories.map((c) => `- ${c.name}`).join("\n")
      : "- (none configured)";

  const supplierList =
    suppliers.length > 0
      ? suppliers
          .map(
            (s) =>
              `- ${s.name} | TRN: ${s.trn && s.trn.trim() !== "" ? s.trn : "none"}`,
          )
          .join("\n")
      : "- (none yet)";

  const inventoryList =
    inventory.length > 0
      ? inventory
          .map(
            (i) =>
              `- id=${i.id} | ${i.name}${i.unit ? ` | unit: ${i.unit}` : ""}`,
          )
          .join("\n")
      : "- (none yet — return inventory_item_id null for every line and always provide suggested_item_name)";

  // Owner-taught raw-text -> item mappings. Lets the model reuse past
  // corrections and match variant spellings it would otherwise miss.
  const aliasList =
    aliases.length > 0
      ? aliases
          .filter((a) => a.inventory_items?.id)
          .map(
            (a) =>
              `- "${a.raw_text}" -> id=${a.inventory_items!.id} (${a.inventory_items!.name})`,
          )
          .join("\n")
      : "- (none yet)";

  // Aggregate last-30-day spend per supplier for outlier detection.
  const spendBySupplier = new Map<
    string,
    { name: string; count: number; total: number }
  >();
  for (const e of recentExpenses) {
    const key = e.supplier_id ?? "unknown";
    const name = e.suppliers?.name ?? "Unknown supplier";
    const prev = spendBySupplier.get(key) ?? { name, count: 0, total: 0 };
    prev.count += 1;
    prev.total += Number(e.total) || 0;
    spendBySupplier.set(key, prev);
  }
  const spendList =
    spendBySupplier.size > 0
      ? Array.from(spendBySupplier.values())
          .map(
            (s) =>
              `- ${s.name}: ${s.count} bill(s), total AED ${s.total.toFixed(
                2,
              )}, avg AED ${(s.total / s.count).toFixed(2)}`,
          )
          .join("\n")
      : "- (no expenses recorded in the last 30 days)";

  return `Today's date is ${today}.

== KNOWN CATEGORIES (choose category_hint from these) ==
${categoryList}

== KNOWN SUPPLIERS (this location's active suppliers) ==
${supplierList}

== KNOWN INVENTORY ITEMS (match line_items to these by id) ==
${inventoryList}

== KNOWN ALIASES (raw receipt text already matched before -> item id; reuse when a line's text is the same or a close variant) ==
${aliasList}

== RECENT SUPPLIER SPEND (last 30 days — use to judge spend_outlier) ==
${spendList}`;
}

export async function POST(request: Request) {
  const session = await getBaristaSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { image?: string; mediaType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { image, mediaType } = body;

  if (!image || typeof image !== "string") {
    return NextResponse.json(
      { error: "image (base64 string) is required" },
      { status: 400 }
    );
  }

  const isPdf = mediaType === PDF_MEDIA_TYPE;
  if (
    !mediaType ||
    (!isPdf && !VALID_MEDIA_TYPES.includes(mediaType as ValidMediaType))
  ) {
    return NextResponse.json(
      {
        error: `mediaType must be one of: ${[...VALID_MEDIA_TYPES, PDF_MEDIA_TYPE].join(", ")}`,
      },
      { status: 400 }
    );
  }

  const base64Data = image.includes(",") ? image.split(",")[1] : image;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Pull the matching context the model needs. RLS-bypassing service client:
  // this is a server-only read scoped to the barista's own location.
  const supabase = createServiceClient();
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Dubai",
  });
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });

  const [categoriesRes, suppliersRes, inventoryRes, recentExpensesRes, aliasesRes] =
    await Promise.all([
      supabase.from("categories").select("id, name").eq("is_active", true),
      supabase
        .from("suppliers")
        .select("id, name, trn")
        .eq("is_active", true)
        .eq("location_id", session.lid),
      supabase
        .from("inventory_items")
        .select("id, name, unit")
        .eq("is_active", true)
        .eq("location_id", session.lid),
      supabase
        .from("expenses")
        .select("supplier_id, total, suppliers(name)")
        .eq("location_id", session.lid)
        .gte("expense_date", thirtyDaysAgo),
      supabase
        .from("item_aliases")
        .select("raw_text, inventory_items(id, name)")
        .eq("location_id", session.lid),
    ]);

  const contextBlock = buildContextBlock({
    today,
    categories: (categoriesRes.data ?? []) as unknown as CategoryRow[],
    suppliers: (suppliersRes.data ?? []) as unknown as SupplierRow[],
    inventory: (inventoryRes.data ?? []) as unknown as InventoryRow[],
    recentExpenses: (recentExpensesRes.data ?? []) as unknown as RecentExpenseRow[],
    aliases: (aliasesRes.data ?? []) as unknown as AliasRow[],
  });

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      // Forced tool call = the answer always arrives as a parsed object, so
      // the model's own reasoning can never break JSON parsing.
      tools: [
        {
          name: "record_bill",
          description: "Record the data extracted from the bill, following the schema in the instructions.",
          input_schema: {
            type: "object",
            properties: {
              supplier_name: { type: ["string", "null"] },
              total: { type: ["number", "null"] },
              line_items: { type: "array", items: { type: "object" } },
              confidence: { type: "object" },
              anomalies: { type: "object" },
            },
            required: ["supplier_name", "total", "line_items", "confidence", "anomalies"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "record_bill" },
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? // PDF document block. The pinned SDK (0.30) predates the
                // non-beta type, but the API accepts it — cast for TS only.
                ({
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: PDF_MEDIA_TYPE,
                    data: base64Data,
                  },
                } as unknown as Anthropic.ImageBlockParam)
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType as ValidMediaType,
                    data: base64Data,
                  },
                },
            {
              type: "text",
              text: `Extract the receipt data from this ${isPdf ? "PDF" : "photo"}. Use the context below to match line items to inventory, pick a category, and judge anomalies. Return JSON only.\n\n${contextBlock}`,
            },
          ],
        },
      ],
    });
    await logResponseUsage("photo-bill", "claude-sonnet-4-6", (response as unknown as { usage?: unknown }).usage);

    let extracted: unknown = null;
    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (toolBlock && toolBlock.type === "tool_use" && toolBlock.input && typeof toolBlock.input === "object") {
      extracted = toolBlock.input;
    } else {
      // Fallback: pull the outermost {...} out of any text reply.
      const text = response.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("\n");
      const a = text.indexOf("{");
      const z = text.lastIndexOf("}");
      try {
        extracted = a >= 0 && z > a ? JSON.parse(text.slice(a, z + 1)) : null;
      } catch {
        extracted = null;
      }
      if (!extracted) {
        return NextResponse.json(
          { error: "The AI couldn't read this bill. Please try again, or enter it by hand." , raw: text.slice(0, 2000) },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      extracted,
      usage: response.usage,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Anthropic API error: ${message}` },
      { status: 502 }
    );
  }
}
