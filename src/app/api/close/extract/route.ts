import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getBaristaSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 60;

// v2 extraction prompt — adds an anomalies object so closings that don't
// reconcile (grand-total mismatch, future date, unaccounted cash float) can
// be auto-routed to the owner review queue.
const SYSTEM_PROMPT = `You extract structured data from photos of end-of-day closing reports for Qave Cafe in Al Ain, UAE.

The photo is usually the POS "Payment Methods" report (a tablet screen photographed with a phone — it may be dark, angled or have glare). It can also be a printed Z-report or a handwritten cash-up sheet.

== PAYMENT METHODS ==
The café is paid through: Cash, Card, Talabat, Keeta and Beanz. On the POS "Payment Methods" report each method is one row with columns: Transactions, Total Sales, Net Sales, Tax, Refunded.
- Use the "Total Sales" amount of each row. The "Transactions" column is a COUNT of orders — never read it as money.
- cash_total = the Cash row. card_total = the Card row (also "Visa", "Mastercard", "Network").
- talabat_total = the Talabat row. keeta_total = the Keeta row (OCR may show it as "Kaeeta", "Keta", "Keeta Food" or "كيتا"). beanz_total = the Beanz row.
- other_online_total = any other online or delivery method (Deliveroo, Careem, Noon, "Online"...) added together; null if there is none.
- When the report clearly lists all methods and one of the five has no row, return 0 for it with "high" confidence. If the list is cut off or unreadable, return null.
- online_total = talabat_total + keeta_total + beanz_total + other_online_total (treat nulls as 0).
- grand_total = the report's "Total Sales" figure in the header.

== EXTRACTION RULES ==
- The photo may be in English, Arabic, or a mix. Numbers may be in Western digits (0-9) OR Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩). Always normalize to Western digits in the output.
- Currency is AED (shown as "AED", "د.إ" or "Dhs"). Strip currency symbols and commas; output bare numbers (e.g. 1234.50 not "AED 1,234.50").
- Dates: UAE convention is DD/MM/YYYY or DD-MM-YYYY. Be careful — 03/04/2026 is 3 April, not 4 March. Output ISO format YYYY-MM-DD. If the report only says "Today", return closing_date null (the barista picks the day).
- cash_float_start / cash_float_end: the cash in the drawer at the start and end of the shift. Many reports do not show these — return null if not present, do NOT guess.
- If a field is not visible or you cannot read it, return null. Do NOT guess.

== CONFIDENCE ==
Self-rate confidence per field: "high" = clearly visible and unambiguous, "medium" = visible but partially unclear or requires interpretation, "low" = guessed from context or barely visible.

== ANOMALIES ==
Populate "anomalies" to flag anything that should pause this closing for owner review. Possible flags:
- "grand_total_mismatch": grand_total does not equal cash_total + card_total + online_total.
- "future_date": closing_date is after today's date (given below).
- "negative_value": any total is negative.
- "refunds": the report shows refunds greater than 0.
- "cash_float_discrepancy": cash_float_start and cash_float_end are both present, and (cash_float_end - cash_float_start) - cash_total is materially non-zero.
- "unreadable": one or more key fields could not be read with confidence.
Set has_anomaly to true if any flag fires. Put a one-line, plain-English explanation in "explanation" (or null if no anomaly).

Return ONLY valid JSON matching this schema, no markdown fences, no commentary:

{
  "closing_date": "YYYY-MM-DD" | null,
  "cash_total": number | null,
  "card_total": number | null,
  "talabat_total": number | null,
  "keeta_total": number | null,
  "beanz_total": number | null,
  "other_online_total": number | null,
  "online_total": number | null,
  "grand_total": number | null,
  "cash_float_start": number | null,
  "cash_float_end": number | null,
  "notes": string | null,
  "confidence": {
    "closing_date": "high" | "medium" | "low",
    "cash_total": "high" | "medium" | "low",
    "card_total": "high" | "medium" | "low",
    "talabat_total": "high" | "medium" | "low",
    "keeta_total": "high" | "medium" | "low",
    "beanz_total": "high" | "medium" | "low",
    "grand_total": "high" | "medium" | "low"
  },
  "anomalies": {
    "has_anomaly": boolean,
    "flags": string[],
    "explanation": string | null
  }
}

If the image is clearly NOT a closing report (random photo, completely dark, blurry beyond recognition), return all data fields as null, every confidence "low", and anomalies with has_anomaly true, flags ["unreadable"], and a brief explanation in "notes".`;

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

  // Strip "data:image/...;base64," prefix if present (browsers add this)
  const base64Data = image.includes(",") ? image.split(",")[1] : image;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const client = new Anthropic({ apiKey });

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Dubai",
  });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1536,
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
              text: `Extract the closing report from this photo. Judge anomalies against today's date: ${today}. Return JSON only.`,
            },
          ],
        },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text in model response" },
        { status: 502 }
      );
    }

    // Parse JSON
    let extracted: unknown;
    try {
      // Strip any wrapping markdown fences just in case
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
