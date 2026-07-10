import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// v2 extraction prompt — adds line-item extraction, inventory matching,
// per-field confidence, and an anomalies object for auto-routing to the
// owner review queue. The dynamic context (categories, suppliers, inventory,
// recent spend) is appended to the user message, not the system prompt.
const SYSTEM_PROMPT = `You extract structured data from photos of supplier invoices and cash receipts for Qave Cafe in Al Ain, UAE.

The photo is an expense receipt — a printed VAT invoice, a handwritten cash receipt, a delivery note, or a screenshot from a payment app.

== EXTRACTION RULES ==
- The photo may be English, Arabic, or a mix. Numbers may be Western digits (0-9) OR Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩). Always normalize to Western digits in the output.
- Currency is AED. Strip currency symbols and commas; output bare numbers (e.g. 1234.50 not "AED 1,234.50").
- Dates: UAE convention is DD/MM/YYYY or DD-MM-YYYY. Be careful — 03/04/2026 is 3 April, not 4 March. Output ISO format YYYY-MM-DD.
- UAE VAT rate is 5%. If subtotal and total are both visible, vat_amount = total - subtotal. If only total is visible, leave vat_amount null (do NOT compute backwards — many small suppliers do not charge VAT).
- Supplier name: extract the business/seller name as printed. If the receipt says "Tax Invoice" or "Credit Note" at the top, the supplier is usually below that.
- Invoice number: any unique identifier on the receipt ("Invoice No", "Receipt #", "Ref", etc.).
- Payment method: infer from the receipt — "cash", "card", "bank_transfer", or "credit" (marked unpaid / on account).
- If a field is not visible or you cannot read it, return null. Do NOT guess.

== LINE ITEMS ==
Extract every purchased line on the receipt into "line_items". For each line:
- description: the item text as printed, normalized to Western digits.
- quantity / unit_price / line_total: numbers. If only a line total is visible, set quantity 1 and unit_price = line_total.
- inventory_item_id: if the line clearly matches one of the KNOWN INVENTORY ITEMS listed below — same product, allowing for spelling, translation, or brand variants — return that item's exact id. Also consult KNOWN ALIASES below: if the line text equals or closely matches an alias's raw text, return that alias's item id. Otherwise null.
- suggested_item_name: when inventory_item_id is null, give a short canonical English name for the item (e.g. "Whole milk 1L", "Vanilla syrup", "Paper cups 8oz"). When you DID match an inventory item, return null.
- match_confidence: "high" | "medium" | "low" — your confidence in the inventory match, or in the quality of the suggested name.
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

Return ONLY valid JSON matching this schema — no markdown fences, no commentary, no explanation outside the JSON:

{
  "supplier_name": string | null,
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
      "inventory_item_id": string | null,
      "suggested_item_name": string | null,
      "match_confidence": "high" | "medium" | "low"
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

  if (!mediaType || !VALID_MEDIA_TYPES.includes(mediaType as ValidMediaType)) {
    return NextResponse.json(
      { error: `mediaType must be one of: ${VALID_MEDIA_TYPES.join(", ")}` },
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
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as ValidMediaType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: `Extract the receipt data from this photo. Use the context below to match line items to inventory, pick a category, and judge anomalies. Return JSON only.\n\n${contextBlock}`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text in model response" },
        { status: 502 }
      );
    }

    let extracted: unknown;
    try {
      const cleaned = textBlock.text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "");
      extracted = JSON.parse(cleaned);
    } catch (e) {
      return NextResponse.json(
        {
          error: "Model did not return valid JSON",
          raw: textBlock.text,
          parseError: e instanceof Error ? e.message : String(e),
        },
        { status: 502 }
      );
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
