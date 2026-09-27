"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { uploadReceiptPhoto } from "@/lib/drive/upload";
import { todayDubai } from "@/lib/dates";
import { broadcastLive } from "@/lib/live";
import { getSettings } from "@/lib/settings";
import { after } from "next/server";
import { notifyNewClosing } from "@/lib/push";

type Confidence = "high" | "medium" | "low";

type ConfidenceMap = {
  closing_date?: Confidence;
  cash_total?: Confidence;
  card_total?: Confidence;
  online_total?: Confidence;
  talabat_total?: Confidence;
  keeta_total?: Confidence;
  beanz_total?: Confidence;
  grand_total?: Confidence;
};

// AI anomaly object (v2 extraction). Stored as-is in closings.ai_anomalies
// and used to auto-route a closing to the review queue.
type Anomalies = {
  has_anomaly?: boolean;
  flags?: string[];
  explanation?: string | null;
} | null;

function parseNumberOrNull(raw: string | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

function parseAnomalies(raw: string | null): Anomalies {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Anomalies;
    return null;
  } catch {
    return null;
  }
}

function deriveStatus(
  confidence: ConfidenceMap,
  anomalies: Anomalies,
  autoApprove: boolean,
  amounts: { cash: number; card: number; online: number; talabat: number | null; keeta: number | null; beanz: number | null },
  aiGrand: number | null,
): "confirmed" | "pending_review" | "flagged" {
  // Do the entered totals add up to the report's own total? Then a payment method with no row
  // (e.g. no Keeta orders that day) is simply 0 — not a reason to hold the closing.
  const sum = amounts.cash + amounts.card + amounts.online;
  const reconciles = aiGrand != null && Math.abs(sum - aiGrand) <= 0.01;
  const a = anomalies as { has_anomaly?: boolean; flags?: unknown } | null | undefined;
  const flags = Array.isArray(a?.flags) ? (a!.flags as unknown[]).filter((f): f is string => typeof f === "string") : [];
  // Real problems always hold it: refunds, a total that doesn't match, a future date, negatives, float issues…
  if (flags.some((f) => f !== "unreadable")) return "flagged";
  if (a?.has_anomaly && !reconciles) return "flagged";
  const conf = (confidence ?? {}) as Record<string, string | undefined>;
  const unsure = (k: string) => !!conf[k] && conf[k] !== "high";
  if (["closing_date", "cash_total", "card_total"].some(unsure)) return "flagged";
  // Delivery apps: only the ones that actually had money need a confident read.
  const apps: [string, number | null][] = [["talabat_total", amounts.talabat], ["keeta_total", amounts.keeta], ["beanz_total", amounts.beanz]];
  const split = apps.some(([, v]) => v != null);
  if (!reconciles && apps.some(([k, v]) => (v ?? 0) > 0 && unsure(k))) return "flagged";
  if (!split && !reconciles && unsure("online_total")) return "flagged";
  // Clean: straight into the books when auto-approve is on, else it waits for the owner.
  return autoApprove ? "confirmed" : "pending_review";
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
  // New form: Talabat / Keeta / Beanz (+ other online); a blank app field means 0.
  // Old queued (offline) submissions only carry online_total.
  const hasApps = ["talabat_total", "keeta_total", "beanz_total"].some((k) => formData.has(k));
  const app = (k: string) => (hasApps ? parseNumberOrNull(formData.get(k) as string | null) ?? 0 : null);
  const talabat_total = app("talabat_total");
  const keeta_total = app("keeta_total");
  const beanz_total = app("beanz_total");
  const other_online = parseNumberOrNull(formData.get("other_online_total") as string | null) ?? 0;
  const online_total = hasApps
    ? Math.round(((talabat_total ?? 0) + (keeta_total ?? 0) + (beanz_total ?? 0) + other_online) * 100) / 100
    : parseNumberOrNull(formData.get("online_total") as string | null);
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

  const anomalies = parseAnomalies(
    formData.get("ai_anomalies") as string | null,
  );

  if (!closing_date) return { error: "Closing date is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closing_date)) {
    return { error: "Closing date must be in YYYY-MM-DD format" };
  }
  if (closing_date > todayDubai()) {
    return { error: "That date is in the future. Pick today or an earlier day." };
  }
  if (cash_total == null || card_total == null || online_total == null) {
    return { error: hasApps ? "Cash and card totals are required" : "Cash, card, and online totals are all required" };
  }
  if (cash_total < 0 || card_total < 0 || online_total < 0 || [talabat_total, keeta_total, beanz_total].some((v) => v != null && v < 0) || other_online < 0) {
    return { error: "Totals cannot be negative" };
  }

  const aiGrand = parseNumberOrNull(formData.get("ai_grand_total") as string | null);
  const status = deriveStatus(
    confidence,
    anomalies,
    (await getSettings()).autoApproveClosings,
    { cash: cash_total, card: card_total, online: online_total, talabat: talabat_total, keeta: keeta_total, beanz: beanz_total },
    aiGrand,
  );
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
      talabat_total,
      keeta_total,
      beanz_total,
      cash_float_start,
      cash_float_end,
      notes,
      ai_confidence: confidence,
      ai_anomalies: anomalies,
      status,
    })
    .select("id, location_id")
    .single();

  if (error || !inserted) {
    return {
      error: `Could not save closing: ${error?.message ?? "unknown error"}`,
    };
  }

  // Owner screens update on the spot, and the owner's phone gets a lock-screen alert.
  await broadcastLive({ t: "closings", id: inserted.id });
  after(() => notifyNewClosing(inserted.id));

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

  await broadcastLive({ t: "closings", id: inserted.id });

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
      talabat_total,
      keeta_total,
      beanz_total,
      status,
    },
  });

  revalidatePath("/owner");
  revalidatePath("/owner/closings");
  revalidatePath("/owner/review");
  revalidatePath("/today");

  redirect("/today?submitted=closing");
}
