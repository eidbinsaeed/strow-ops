"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

type Confidence = "high" | "medium" | "low";

type ConfidenceMap = {
  closing_date?: Confidence;
  cash_total?: Confidence;
  card_total?: Confidence;
  online_total?: Confidence;
  grand_total?: Confidence;
};

function parseNumberOrNull(raw: string | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

/**
 * Derive submission status from per-field confidence.
 *
 * Note: grand_total is a GENERATED column in Postgres (computed as
 * cash + card + online), so by definition it always reconciles.
 * The only signal we have is the AI's confidence on the input fields.
 *
 * Per D5: high-confidence on every key field → auto-confirm. Else → owner reviews.
 */
function deriveStatus(confidence: ConfidenceMap): "confirmed" | "pending_review" {
  const fields: (keyof ConfidenceMap)[] = [
    "closing_date",
    "cash_total",
    "card_total",
    "online_total",
  ];
  const anyNotHigh = fields.some(
    (f) => confidence[f] && confidence[f] !== "high"
  );
  return anyNotHigh ? "pending_review" : "confirmed";
}

export async function submitClosing(formData: FormData) {
  const session = await getBaristaSession();
  if (!session) return { error: "Not signed in" };

  const closing_date = String(formData.get("closing_date") ?? "").trim();
  const cash_total = parseNumberOrNull(
    formData.get("cash_total") as string | null
  );
  const card_total = parseNumberOrNull(
    formData.get("card_total") as string | null
  );
  const online_total = parseNumberOrNull(
    formData.get("online_total") as string | null
  );
  const cash_float_start = parseNumberOrNull(
    formData.get("cash_float_start") as string | null
  );
  const cash_float_end = parseNumberOrNull(
    formData.get("cash_float_end") as string | null
  );
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // Confidence comes through as JSON string in a hidden input.
  let confidence: ConfidenceMap = {};
  try {
    const raw = String(formData.get("ai_confidence") ?? "{}");
    confidence = JSON.parse(raw) as ConfidenceMap;
  } catch {
    // Ignore — defaults to pending_review
  }

  // Validation
  if (!closing_date) return { error: "Closing date is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closing_date)) {
    return { error: "Closing date must be in YYYY-MM-DD format" };
  }
  if (cash_total == null || card_total == null || online_total == null) {
    return { error: "Cash, card, and online totals are all required" };
  }
  if (cash_total < 0 || card_total < 0 || online_total < 0) {
    return { error: "Totals cannot be negative" };
  }

  const status = deriveStatus(confidence);

  const supabase = createServiceClient();

  // Note: grand_total and over_short are GENERATED columns — Postgres
  // computes them automatically. Do NOT include them in the insert.
  // Note: photo_storage_url does not exist on the table (per D6 — Drive primary).
  const { error } = await supabase.from("closings").insert({
    location_id: session.lid,
    barista_id: session.bid,
    closing_date,
    cash_total,
    card_total,
    online_total,
    cash_float_start: cash_float_start ?? 0,
    cash_float_end: cash_float_end ?? 0,
    notes,
    ai_confidence: confidence,
    status,
    // photo_drive_url and photo_drive_path stay null until Drive sync ships
  });

  if (error) {
    return { error: `Could not save closing: ${error.message}` };
  }

  revalidatePath("/owner");
  revalidatePath("/owner/closings");
  revalidatePath("/owner/review");
  revalidatePath("/today");

  redirect("/today?submitted=closing");
}
