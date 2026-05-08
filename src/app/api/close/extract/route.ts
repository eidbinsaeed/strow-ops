import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getBaristaSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You extract structured data from photos of end-of-day close sheets for Qave Cafe in Al Ain, UAE.

The photo is the daily reconciliation summary printed (or written) at the end of a barista's shift. It will look like a Z-report from a POS, a handwritten cash-up sheet, or a screenshot from POS software (often Qave or similar).

CRITICAL RULES:
- The photo may be in English, Arabic, or a mix. Numbers may be in Western digits (0-9) OR Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩). Always normalize to Western digits in the output.
- Currency is AED. Strip currency symbols and commas; output bare numbers (e.g. 1234.50 not "AED 1,234.50").
- Dates: UAE convention is DD/MM/YYYY or DD-MM-YYYY. Be careful — 03/04/2026 is 3 April, not 4 March. Output ISO format YYYY-MM-DD.
- If a field is not visible or you cannot read it, return null. Do NOT guess.
- Self-rate confidence per field: "high" = clearly visible and unambiguous, "medium" = visible but partially unclear or requires interpretation, "low" = guessed from context or barely visible.

Return ONLY valid JSON matching this schema, no markdown fences, no commentary, no explanation:

{
  "closing_date": "YYYY-MM-DD" | null,
  "cash_total": number | null,
  "card_total": number | null,
  "online_total": number | null,
  "grand_total": number | null,
  "cash_float_start": number | null,
  "cash_float_end": number | null,
  "notes": string | null,
  "confidence": {
    "closing_date": "high" | "medium" | "low",
    "cash_total": "high" | "medium" | "low",
    "card_total": "high" | "medium" | "low",
    "online_total": "high" | "medium" | "low",
    "grand_total": "high" | "medium" | "low"
  }
}

If the image is clearly NOT a close sheet (e.g. random photo, blurry beyond recognition), return all fields as null with confidence "low" and put a brief explanation in "notes".`;

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
              text: "Extract the close sheet data from this photo. Return JSON only.",
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
