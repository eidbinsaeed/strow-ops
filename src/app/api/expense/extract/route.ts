import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getBaristaSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You extract structured data from photos of supplier invoices and cash receipts for Qave Cafe in Al Ain, UAE.

The photo is an expense receipt — could be a printed VAT invoice, a handwritten cash receipt, a delivery note, or a screenshot from a payment app.

CRITICAL RULES:
- The photo may be in English, Arabic, or a mix. Numbers may be in Western digits (0-9) OR Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩). Always normalize to Western digits in the output.
- Currency is AED. Strip currency symbols and commas; output bare numbers (e.g. 1234.50 not "AED 1,234.50").
- Dates: UAE convention is DD/MM/YYYY or DD-MM-YYYY. Be careful — 03/04/2026 is 3 April, not 4 March. Output ISO format YYYY-MM-DD.
- UAE VAT rate is 5%. If subtotal and total are both visible, vat_amount = total - subtotal. If only total is visible, leave vat_amount as null (do NOT compute backwards — many small suppliers do not charge VAT).
- Supplier name: extract the business/seller name as printed. If the receipt says "Tax Invoice" or "Credit Note" at top, the supplier is usually below that.
- Invoice number: any unique identifier on the receipt (could be "Invoice No", "Receipt #", "Ref", etc.)
- Payment method: infer from the receipt. "Cash" if cash given, "Card" if a card terminal slip, "Bank transfer" if bank reference shown, "Credit" if marked unpaid/on account.
- If a field is not visible or you cannot read it, return null. Do NOT guess.
- Self-rate confidence per field: "high" = clearly visible and unambiguous, "medium" = visible but partially unclear or requires interpretation, "low" = guessed from context or barely visible.

Return ONLY valid JSON matching this schema, no markdown fences, no commentary, no explanation:

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
  "confidence": {
    "supplier_name": "high" | "medium" | "low",
    "expense_date": "high" | "medium" | "low",
    "invoice_number": "high" | "medium" | "low",
    "subtotal": "high" | "medium" | "low",
    "vat_amount": "high" | "medium" | "low",
    "total": "high" | "medium" | "low",
    "payment_method": "high" | "medium" | "low"
  }
}

For "category_hint": pick the most likely category name from this list based on what was bought:
"Beverage Ingredients", "Resale/Bakery", "Packaging", "Equipment", "Cleaning Supplies", "Utilities", "Rent", "Salaries", "Software/Subscriptions", "Maintenance", "Other"

If the image is clearly NOT a receipt (random photo, blurry beyond recognition), return all data fields as null with confidence "low" and put a brief explanation in "notes".`;

const VALID_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type ValidMediaType = (typeof VALID_MEDIA_TYPES)[number];

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

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
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
              text: "Extract the receipt data from this photo. Return JSON only.",
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
