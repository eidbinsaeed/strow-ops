"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { uploadReceiptPhoto } from "@/lib/drive/upload";

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

function deriveStatus(
  confidence: ConfidenceMap,
): "confirmed" | "pending_review" {
  const fields: (keyof ConfidenceMap)[] = [
    "closing_date",
    "cash_total",
    "card_total",
    "online_total",
  ];
  const anyNotHigh = fields.some(
    (f) => confidence[f] && confidence[f] !== "high",
  );
  return anyNotHigh ? "pending_review" : "confirmed";
}

export async function submitClosing(formData: FormData) {
  const session = await getBaristaSession();
  if (!session) return { error: "Not signed in" };

  const closing_date = String(formData.get("closing_date") ?? "").trim();
  const cash_total = parseNumberOrNull(
    formData.get("cash_total") as string | null,
  );
  const card_total = parseNumberOrNull(
    formData.get("card_total") as string | null,
  );
  const online_total = parseNumberOrNull(
    formData.get("online_total") as string | null,
  );
  const cash_float_start = parseNumberOrNull(
    formData.get("cash_float_start") as string | null,
  );
  const cash_float_end = parseNumberOrNull(
    formData.get("cash_float_end") as string | null,
  );
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const photo_data_url = String(formData.get("photo_data_url") ?? "").trim();
  const photo_media_type =
    String(formData.get("photo_media_type") ?? "").trim() || "image/jpeg";

  let confidence: ConfidenceMap = {};
  try {
    const raw = String(formData.get("ai_confidence") ?? "{}");
    confidence = JSON.parse(raw) as ConfidenceMap;
  } catch {
    // ignore
  }

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

  // grand_total and over_short are GENERATED columns - never insert.
  const { data: inserted, error } = await supabase
    .from("closings")
    .insert({
      location_id: session.lid,
      barista_id: session.bid,
      closing_date,
      cash_total,
      card_total,
      online_total,
      cash_float_start,
      cash_float_end,
      notes,
      ai_confidence: confidence,
      status,
    })
    .select("id, location_id")
    .single();

  if (error || !inserted) {
    return {
      error: `Could not save closing: ${error?.message ?? "unknown error"}`,
    };
  }

  // Best-effort Drive upload + row patch. Failures don't undo the submission.
  if (photo_data_url) {
    const { data: loc } = await supabase
      .from("locations")
      .select("slug")
      .eq("id", inserted.location_id)
      .maybeSingle();
    const slug = loc?.slug ?? "unknown";

    const upload = await uploadReceiptPhoto({
      imageDataUrl: photo_data_url,
      mediaType: photo_media_type,
      locationSlug: slug,
      kind: "closings",
      date: closing_date,
      entityId: inserted.id,
    });

    if (upload) {
      await supabase
        .from("closings")
        .update({
          photo_drive_url: upload.viewUrl,
          photo_drive_path: upload.displayPath,
        })
        .eq("id", inserted.id);
    }
  }

  await writeAudit({
    actor_id: session.bid,
    actor_type: "barista",
    action: status === "confirmed" ? "submitted_confirmed" : "submitted_pending",
    entity_type: "closing",
    entity_id: inserted.id,
    after_state: {
      closing_date,
      cash_total,
      card_total,
      online_total,
      status,
    },
  });

  revalidatePath("/owner");
  revalidatePath("/owner/closings");
  revalidatePath("/owner/review");
  revalidatePath("/today");

  redirect("/today?submitted=closing");
}
