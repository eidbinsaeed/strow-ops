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
 * Determine submission status from confidence + reconciliation.
 * Per D5: high-confidence + math reconciles → auto-confirm.
 * Otherwise → pending_review (owner reviews on dashboard).
 */
function deriveStatus(args: {
  confidence: ConfidenceMap;
  cash: number;
  card: number;
  online: number;
  grand: number;
}): "confirmed" | "pending_review" {
  const { confidence, cash, card, online, grand } = args;

  // Reconciliation: do the parts add up to the whole? Allow 0.01 AED rounding tolerance.
  const sum = cash + card + online;
  const reconciles = Math.abs(sum - grand) < 0.02;

  if (!reconciles) return "pending_review";

  // All key fields high confidence?
  const fields: (keyof ConfidenceMap)[] = [
    "closing_date",
    "cash_total",
    "card_total",
    "online_total",
    "grand_total",
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
  const grand_total = parseNumberOrNull(
    formData.get("grand_total") as string | null
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
    // Ignore — treat as no confidence info, will default to pending_review
  }

  // Validation
  if (!closing_date) return { error: "Closing date is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closing_date)) {
    return { error: "Closing date must be in YYYY-MM-DD format" };
  }
  if (cash_total == null || card_total == null || online_total == null) {
    return { error: "Cash, card, and online totals are all required" };
  }
  if (grand_total == null) {
    return { error: "Grand total is required" };
  }
  if (cash_total < 0 || card_total < 0 || online_total < 0 || grand_total < 0) {
    return { error: "Totals cannot be negative" };
  }

  // Compute over/short if floats provided
  const over_short =
    cash_float_start != null && cash_float_end != null
      ? cash_float_end - cash_float_start - cash_total
      : null;

  const status = deriveStatus({
    confidence,
    cash: cash_total,
    card: card_total,
    online: online_total,
    grand: grand_total,
  });

  const supabase = createServiceClient();

  const { error } = await supabase.from("closings").insert({
    location_id: session.lid,
    barista_id: session.bid,
    closing_date,
    cash_total,
    card_total,
    online_total,
    grand_total,
    cash_float_start,
    cash_float_end,
    over_short,
    notes,
    ai_confidence: confidence,
    status,
    photo_storage_url: null, // photo storage wires when Drive sync ships
    photo_drive_url: null,
    photo_drive_path: null,
  });

  if (error) {
    return { error: `Could not save closing: ${error.message}` };
  }

  // Refresh dashboard + lists so new closing shows up immediately
  revalidatePath("/owner");
  revalidatePath("/owner/closings");
  revalidatePath("/owner/review");
  revalidatePath("/today");

  redirect("/today?submitted=closing");
}
