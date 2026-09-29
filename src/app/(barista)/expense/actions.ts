"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runAutopilot } from "@/lib/ai/autopilot";
import { broadcastLive } from "@/lib/live";
import { getSettings } from "@/lib/settings";
import { notifyNewExpense } from "@/lib/push";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { uploadReceiptPhoto } from "@/lib/drive/upload";
import { todayDubai } from "@/lib/dates";
import { normalizeItemText, looksLikeRealItem } from "@/lib/inventory-match";
import { baseOf, measureOf, num, type LineKind } from "@/lib/units";
import { headerAddsUp, reconcileVat } from "@/lib/vat";
import { checkTrn, isOwnEmail, scrubPhones, type OwnContacts } from "@/lib/supplier-info";

type Confidence = "high" | "medium" | "low";

type ConfidenceMap = {
  supplier_name?: Confidence;
  expense_date?: Confidence;
  invoice_number?: Confidence;
  subtotal?: Confidence;
  vat_amount?: Confidence;
  total?: Confidence;
  payment_method?: Confidence;
};

// AI anomaly object (v2 extraction). Merged with unmatched-inventory
// suggestions and stored in expenses.ai_anomalies. A model-detected anomaly
// auto-routes the expense to the owner review queue.
type Anomalies = {
  has_anomaly?: boolean;
  flags?: string[];
  explanation?: string | null;
} | null;

// A receipt line as extracted by v2. Persisted to expense_line_items.
type LineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  discount: number;
  vat_amount: number;
  inventory_item_id: string | null;
  suggested_item_name: string | null;
  match_confidence: Confidence | null;
  // Goods received (see lib/units.ts)
  line_kind: LineKind;
  brand: string | null;
  uom_printed: string | null;
  pack_qty: number | null;
  pack_type: string | null;
  units_per_pack: number | null;
  count_qty: number | null;
  count_uom: string | null;
  unit_size: number | null;
  size_uom: string | null;
  base_qty: number | null;
  base_uom: string | null;
  vat_rate: number | null;
  set_parts: string[] | null;
};

const KINDS: LineKind[] = ["goods", "fee", "discount", "deposit", "other"];
const txt = (v: unknown, max = 120): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};

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

function parseLineItems(raw: string | null): LineItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (li): li is Record<string, unknown> =>
          li != null && typeof li === "object",
      )
      .map((li) => {
        const line_kind: LineKind = KINDS.includes(li.line_kind as LineKind)
          ? (li.line_kind as LineKind)
          : "goods";
        const set_parts = Array.isArray(li.set_parts)
          ? (li.set_parts as unknown[]).map((x) => txt(x, 30)).filter((x): x is string => !!x).slice(0, 6)
          : [];
        const q = {
          count_qty: num(li.count_qty),
          count_uom: txt(li.count_uom, 30),
          unit_size: num(li.unit_size),
          size_uom: txt(li.size_uom, 30),
          set_parts: set_parts.length ? set_parts : null,
        };
        // Recomputed here — never trust a client-sent base quantity.
        const b = line_kind === "goods" ? baseOf(q) : { base_qty: null, base_uom: null };
        return {
        line_kind,
        brand: txt(li.brand, 60),
        uom_printed: txt(li.uom_printed, 30),
        pack_qty: num(li.pack_qty),
        pack_type: txt(li.pack_type, 30),
        units_per_pack: num(li.units_per_pack),
        ...q,
        ...b,
        vat_rate: num(li.vat_rate),
        description: String(li.description ?? "").trim(),
        quantity: Number(li.quantity) || 0,
        unit_price: Number(li.unit_price) || 0,
        line_total: Number(li.line_total) || 0,
        discount: Number(li.discount) || 0,
        vat_amount: Number(li.vat_amount) || 0,
        inventory_item_id:
          typeof li.inventory_item_id === "string" && li.inventory_item_id
            ? li.inventory_item_id
            : null,
        suggested_item_name:
          typeof li.suggested_item_name === "string" &&
          li.suggested_item_name
            ? li.suggested_item_name
            : null,
        match_confidence:
          li.match_confidence === "high" ||
          li.match_confidence === "medium" ||
          li.match_confidence === "low"
            ? (li.match_confidence as Confidence)
            : null,
        };
      });
  } catch {
    return [];
  }
}

const VALID_PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "credit",
] as const;

type PaymentMethod = (typeof VALID_PAYMENT_METHODS)[number];

function deriveStatus(args: {
  confidence: ConfidenceMap;
  subtotal: number | null;
  vat: number | null;
  total: number;
  anomalies: Anomalies;
  autoApprove: boolean;
}): "confirmed" | "pending_review" | "flagged" {
  const { confidence, subtotal, vat, total, anomalies, autoApprove } = args;

  // Something looks off → flagged: held for the owner, never auto-approved.
  if (anomalies?.has_anomaly) return "flagged";

  // Small rounding (≤ 0.25, e.g. "Rounding -0.20") is normal, not a problem.
  if (!headerAddsUp(subtotal, vat, total)) return "flagged";

  const fields: (keyof ConfidenceMap)[] = [
    "supplier_name",
    "expense_date",
    "total",
    "payment_method",
  ];
  const anyNotHigh = fields.some(
    (f) => confidence[f] && confidence[f] !== "high",
  );
  if (anyNotHigh) return "flagged";

  // Clean: straight into the books when auto-approve is on, else waits for the owner.
  return autoApprove ? "confirmed" : "pending_review";
}

export async function submitExpense(formData: FormData) {
  const session = await getBaristaSession();
  if (!session) return { error: "Not signed in" };

  const supabase = createServiceClient();

  let supplier_id = String(formData.get("supplier_id") ?? "").trim();
  const new_supplier_name = String(
    formData.get("new_supplier_name") ?? "",
  ).trim();

  if (!supplier_id && !new_supplier_name) {
    return { error: "Pick a supplier or enter a new one" };
  }

  // Supplier details read off the bill (TRN digits only).
  const { data: locRow } = await supabase
    .from("locations")
    .select("own_contacts")
    .eq("id", session.lid)
    .maybeSingle();
  const own = (locRow?.own_contacts ?? null) as OwnContacts | null;
  const rawEmail = txt(formData.get("supplier_email"), 120);
  const supplierInfo = {
    trn: checkTrn(txt(formData.get("supplier_trn"), 40)).trn, // 15 digits or nothing
    phone: scrubPhones(txt(formData.get("supplier_phone"), 60), own), // never Qave's own
    email: isOwnEmail(rawEmail, own) ? null : rawEmail,
    address: txt(formData.get("supplier_address"), 300),
  };

  // Same TRN = same company, whatever name is printed → reuse that supplier.
  if (!supplier_id && supplierInfo.trn) {
    const { data: sameTrn } = await supabase
      .from("suppliers")
      .select("id")
      .eq("location_id", session.lid)
      .eq("trn", supplierInfo.trn)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (sameTrn?.id) supplier_id = sameTrn.id as string;
  }

  if (!supplier_id && new_supplier_name) {
    const { data: created, error: supplierError } = await supabase
      .from("suppliers")
      .insert({
        location_id: session.lid,
        name: new_supplier_name,
        notes: "Auto-created from expense submission",
        ...supplierInfo,
      })
      .select("id")
      .single();

    if (supplierError || !created) {
      return {
        error: `Could not create supplier: ${
          supplierError?.message ?? "unknown error"
        }`,
      };
    }
    supplier_id = created.id;

    await writeAudit({
      actor_id: session.bid,
      actor_type: "barista",
      action: "auto_created",
      entity_type: "supplier",
      entity_id: supplier_id,
      after_state: { name: new_supplier_name, ...supplierInfo },
    });
  } else if (supplier_id) {
    // Existing supplier: only fill details that are still empty — never
    // overwrite what the owner already saved.
    const { data: cur } = await supabase
      .from("suppliers")
      .select("trn, phone, email, address")
      .eq("id", supplier_id)
      .maybeSingle();
    if (cur) {
      const fill: Record<string, string> = {};
      for (const k of ["trn", "phone", "email", "address"] as const) {
        const now = (cur as Record<string, string | null>)[k];
        if ((!now || !now.trim()) && supplierInfo[k]) fill[k] = supplierInfo[k]!;
      }
      if (Object.keys(fill).length) {
        await supabase.from("suppliers").update(fill).eq("id", supplier_id);
      }
    }
  }

  const category_id = String(formData.get("category_id") ?? "").trim() || null;
  const expense_date = String(formData.get("expense_date") ?? "").trim();
  const invoice_number =
    String(formData.get("invoice_number") ?? "").trim() || null;
  const subtotal = parseNumberOrNull(formData.get("subtotal") as string | null);
  const vat_amount = parseNumberOrNull(
    formData.get("vat_amount") as string | null,
  );
  const total = parseNumberOrNull(formData.get("total") as string | null);
  const payment_method_raw = String(
    formData.get("payment_method") ?? "",
  ).trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const photo_data_url = String(formData.get("photo_data_url") ?? "").trim();
  const photo_media_type =
    String(formData.get("photo_media_type") ?? "").trim() || "image/jpeg";

  if (!expense_date) return { error: "Expense date is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
    return { error: "Date must be in YYYY-MM-DD format" };
  }
  if (expense_date > todayDubai()) {
    return { error: "That date is in the future. Pick today or an earlier day." };
  }
  if (total == null || total <= 0) {
    return { error: "Total must be a positive number" };
  }
  if (!VALID_PAYMENT_METHODS.includes(payment_method_raw as PaymentMethod)) {
    return { error: "Pick a valid payment method" };
  }
  const payment_method = payment_method_raw as PaymentMethod;

  const finalSubtotal = subtotal != null ? subtotal : total - (vat_amount ?? 0);
  const finalVat = vat_amount ?? 0;

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
  const lineItems = parseLineItems(
    formData.get("line_items") as string | null,
  );

  // Line items the AI couldn't confidently match to an inventory item are
  // recorded in ai_anomalies as suggestions for the owner's weekly inventory
  // review. They do NOT on their own pause the expense — only a model-level
  // anomaly does that (see deriveStatus).
  // Fees, discounts and deposits are never inventory.
  for (const li of lineItems) {
    if (li.line_kind !== "goods") {
      li.inventory_item_id = null;
      li.suggested_item_name = null;
    }
  }

  // Work out whether printed line prices include VAT; store every line as
  // NET + its VAT share so cost per unit is consistent across all suppliers.
  const printedRounding = parseNumberOrNull(formData.get("rounding") as string | null);
  const vr = reconcileVat(lineItems, {
    subtotal,
    vat: vat_amount,
    total,
    rounding: printedRounding,
    pricesIncludeVat: String(formData.get("prices_include_vat") ?? "") === "1" ? true : null,
  });
  vr.lines.forEach((l, i) => {
    lineItems[i].line_total = l.line_total;
    lineItems[i].vat_amount = l.vat_amount;
  });
  const goodsReceived = String(formData.get("goods_received") ?? "1") !== "0";

  const unmatchedSuggestions = lineItems
    .filter((li) => li.line_kind === "goods" && !li.inventory_item_id && li.suggested_item_name)
    .map((li) => ({
      description: li.description,
      suggested_item_name: li.suggested_item_name,
    }));
  const finalAnomalies =
    anomalies || unmatchedSuggestions.length > 0
      ? { ...(anomalies ?? {}), unmatched_inventory: unmatchedSuggestions }
      : null;

  const status = deriveStatus({
    confidence,
    subtotal,
    vat: vat_amount,
    total,
    anomalies,
    autoApprove: (await getSettings()).autoApproveBills,
  });

  const { data: inserted, error } = await supabase
    .from("expenses")
    .insert({
      location_id: session.lid,
      barista_id: session.bid,
      supplier_id,
      category_id,
      expense_date,
      invoice_number,
      // Header figures missing on the bill → use the worked-out VAT split.
      subtotal: subtotal ?? (lineItems.length && vr.ok ? vr.subtotal : null) ?? finalSubtotal,
      vat_amount: vat_amount ?? (lineItems.length && vr.ok ? vr.vat : null) ?? finalVat,
      total,
      payment_method,
      notes,
      doc_type: txt(formData.get("doc_type"), 30),
      order_ref: txt(formData.get("order_ref"), 80),
      salesperson: txt(formData.get("salesperson"), 80),
      payment_terms: txt(formData.get("payment_terms"), 80),
      goods_received: goodsReceived,
      vat_mode: lineItems.length ? vr.mode : null,
      rounding: vr.rounding || printedRounding || null,
      ai_confidence: confidence,
      ai_anomalies: finalAnomalies,
      status,
    })
    .select("id, location_id")
    .single();

  if (error || !inserted) {
    return {
      error: `Could not save expense: ${error?.message ?? "unknown error"}`,
    };
  }

  // Best-effort: persist extracted line items. A failure here must NOT undo
  // the expense — the expense row is the source of truth.
  if (lineItems.length > 0) {
    // Validate inventory_item_id against the location's real inventory so a
    // hallucinated id can't break the insert on the FK constraint.
    const { data: invRows } = await supabase
      .from("inventory_items")
      .select("id, name")
      .eq("location_id", inserted.location_id)
      .eq("is_active", true);
    const validInvIds = new Set(
      ((invRows ?? []) as { id: string; name: string }[]).map((r) => r.id),
    );
    const idByNormName = new Map(
      ((invRows ?? []) as { id: string; name: string }[]).map((r) => [
        normalizeItemText(r.name),
        r.id,
      ]),
    );

    // Auto-create catalog items for lines the AI is highly confident about
    // that don't yet exist, then remember the mapping. Deduped by normalized
    // name and by taught alias; junk text ("unknown", handwritten…) is skipped.
    // Never overwrites an existing match. Best-effort: any failure is swallowed
    // so it can never undo the expense.
    const createdThisBatch = new Map<string, string>();
    for (const li of lineItems) {
      if (li.line_kind !== "goods") continue;
      if (li.inventory_item_id && validInvIds.has(li.inventory_item_id)) continue;
      if (li.match_confidence !== "high") continue;
      if (!looksLikeRealItem(li.suggested_item_name)) continue;

      const name = li.suggested_item_name!.trim();
      const nn = normalizeItemText(name);
      let itemId = idByNormName.get(nn) ?? createdThisBatch.get(nn) ?? null;

      if (!itemId) {
        const ndesc = normalizeItemText(li.description);
        const { data: aliasHit } = await supabase
          .from("item_aliases")
          .select("inventory_item_id")
          .eq("location_id", inserted.location_id)
          .eq("norm", ndesc)
          .maybeSingle();
        const aliasId = aliasHit?.inventory_item_id as string | undefined;
        if (aliasId && validInvIds.has(aliasId)) itemId = aliasId;
      }

      if (!itemId) {
        const { data: created, error: createErr } = await supabase
          .from("inventory_items")
          .insert({
            location_id: inserted.location_id,
            name,
            kind: "other",
            is_active: true,
            base_uom: li.base_uom,
            brand: li.brand,
          })
          .select("id")
          .maybeSingle();
        if (createErr || !created) continue;
        itemId = created.id as string;
        validInvIds.add(itemId);
        idByNormName.set(nn, itemId);
        createdThisBatch.set(nn, itemId);
        await writeAudit({
          actor_id: session.bid,
          actor_type: "barista",
          action: "auto_created",
          entity_type: "inventory_item",
          entity_id: itemId,
          after_state: { name, from_description: li.description },
        });
      }

      li.inventory_item_id = itemId;
      await supabase.from("item_aliases").upsert(
        {
          location_id: inserted.location_id,
          inventory_item_id: itemId,
          raw_text: li.description,
          norm: normalizeItemText(li.description),
        },
        { onConflict: "location_id,norm" },
      );
    }

    const rows = lineItems.map((li, index) => ({
      expense_id: inserted.id,
      description: li.description || "(no description)",
      quantity: li.quantity || 1,
      unit_price: li.unit_price || 0,
      line_total: li.line_total || 0,
      discount: li.discount || 0,
      vat_amount: li.vat_amount || 0,
      inventory_item_id:
        li.inventory_item_id && validInvIds.has(li.inventory_item_id)
          ? li.inventory_item_id
          : null,
      position: index,
      line_kind: li.line_kind,
      brand: li.brand,
      uom_printed: li.uom_printed,
      pack_qty: li.pack_qty,
      pack_type: li.pack_type,
      units_per_pack: li.units_per_pack,
      count_qty: li.count_qty,
      count_uom: li.count_uom,
      unit_size: li.unit_size,
      size_uom: li.size_uom,
      base_qty: li.base_qty,
      base_uom: li.base_uom,
      vat_rate: li.vat_rate,
      set_parts: li.set_parts,
    }));

    // Teach each matched item its base unit and usual pack size the first
    // time we see them, so bills that don't print a size still count right.
    for (const li of lineItems) {
      if (li.line_kind !== "goods" || !li.inventory_item_id || !validInvIds.has(li.inventory_item_id)) continue;
      if (li.base_uom) {
        await supabase
          .from("inventory_items")
          .update({ base_uom: li.base_uom, ...(li.brand ? { brand: li.brand } : {}) })
          .eq("id", li.inventory_item_id)
          .is("base_uom", null);
      }
      if (li.unit_size && measureOf(li.size_uom) && !(li.set_parts && li.set_parts.length > 1)) {
        await supabase
          .from("inventory_items")
          .update({ default_unit_size: li.unit_size, default_size_uom: li.size_uom })
          .eq("id", li.inventory_item_id)
          .is("default_unit_size", null);
      }
    }

    const { error: lineError } = await supabase
      .from("expense_line_items")
      .insert(rows);
    if (lineError) {
      // eslint-disable-next-line no-console
      console.error(
        "[submitExpense] line items insert failed:",
        lineError.message,
      );
    }
  }

  // Best-effort Drive upload + row patch.
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
      kind: "expenses",
      date: expense_date,
      entityId: inserted.id,
    });

    if (upload) {
      await supabase
        .from("expenses")
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
    entity_type: "expense",
    entity_id: inserted.id,
    after_state: {
      expense_date,
      supplier_id,
      total,
      payment_method,
      status,
      line_item_count: lineItems.length,
    },
  });

  // Owner screens update on the spot.
  await broadcastLive({ t: "expenses", id: inserted.id as string });
  after(() => notifyNewExpense(inserted.id as string));

  // Strow AI checks the new bill in the background (after the response is sent).
  if (process.env.ANTHROPIC_API_KEY) {
    const newExpenseId = inserted.id as string;
    after(async () => {
      try {
        await runAutopilot("expense", { expenseId: newExpenseId });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[autopilot] expense check failed:", e);
      }
    });
  }

  revalidatePath("/owner");
  revalidatePath("/owner/expenses");
  revalidatePath("/owner/review");
  revalidatePath("/owner/suppliers");
  revalidatePath("/today");

  redirect("/today?submitted=expense");
}
