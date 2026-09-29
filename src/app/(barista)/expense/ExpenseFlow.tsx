"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { submitExpense } from "./actions";
import { enqueueSubmission } from "@/lib/offline/queue";
import { prepareBillFile } from "@/lib/image";
import { DayPicker } from "@/components/barista/DayPicker";
import { ItemsReceived, type RawLine } from "@/components/barista/ItemsReceived";
import { shortDay, todayDubai } from "@/lib/dates";

type Confidence = "high" | "medium" | "low";

type LineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  inventory_item_id: string | null;
  suggested_item_name: string | null;
  match_confidence?: Confidence;
};

type Anomalies = {
  has_anomaly: boolean;
  flags: string[];
  explanation: string | null;
};

type Extracted = {
  supplier_name: string | null;
  supplier_trn?: string | null;
  supplier_address?: string | null;
  supplier_phone?: string | null;
  supplier_email?: string | null;
  doc_type?: string | null;
  order_ref?: string | null;
  salesperson?: string | null;
  payment_terms?: string | null;
  expense_date: string | null;
  invoice_number: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total: number | null;
  payment_method: "cash" | "card" | "bank_transfer" | "credit" | null;
  category_hint: string | null;
  notes: string | null;
  line_items?: LineItem[] | null;
  confidence?: {
    supplier_name?: Confidence;
    expense_date?: Confidence;
    invoice_number?: Confidence;
    subtotal?: Confidence;
    vat_amount?: Confidence;
    total?: Confidence;
    payment_method?: Confidence;
  };
  anomalies?: Anomalies | null;
};

type Stage = "capture" | "processing" | "review";

const CONFIDENCE_BORDER: Record<Confidence, string> = {
  high: "border-emerald-300 bg-white",
  medium: "border-amber-300 bg-amber-50",
  low: "border-red-300 bg-red-50",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "AI is confident",
  medium: "Please verify",
  low: "Please correct",
};

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "";
  return String(n);
}

type Supplier = { id: string; name: string };
type Category = { id: string; name: string };

export function ExpenseFlow({
  baristaName,
  suppliers,
  categories,
  initialDate,
}: {
  baristaName: string;
  suppliers: Supplier[];
  categories: Category[];
  initialDate?: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("capture");
  // The day this upload is for. Defaults to today (Dubai); barista only
  // changes it when uploading an older sheet/bill.
  const [pickedDate, setPickedDate] = useState<string>(initialDate ?? todayDubai());
  const [formDate, setFormDate] = useState<string>(pickedDate);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string>("image/jpeg");
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [supplierMode, setSupplierMode] = useState<"existing" | "new">(
    "existing",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const isPdf = imageMediaType === "application/pdf";

  async function handleFile(file: File) {
    setErrorMsg(null);
    setStage("processing");

    // Photos: downscale + re-encode to JPEG (full-res phone photos are too
    // large for the extract API). PDFs: sent as-is, Claude reads them natively.
    let dataUrl: string;
    let mediaType: string;
    try {
      const prepared = await prepareBillFile(file);
      dataUrl = prepared.dataUrl;
      mediaType = prepared.mediaType;
      setFileName(prepared.fileName);
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : "Could not read that file. Please try again.",
      );
      setStage("capture");
      resetInputs();
      return;
    }
    setImageDataUrl(dataUrl);
    setImageMediaType(mediaType);

    try {
      const res = await fetch("/api/expense/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, mediaType }),
      });

      let json: { ok?: boolean; error?: string; extracted?: unknown };
      try {
        json = await res.json();
      } catch {
        setErrorMsg(
          `The server sent back an unexpected response (status ${res.status}). Please try again.`,
        );
        setStage("capture");
        return;
      }

      if (!res.ok || !json.ok) {
        setErrorMsg(json.error ?? "Extraction failed. Please try again.");
        setStage("capture");
        return;
      }

      const ext = json.extracted as Extracted;
      setExtracted(ext);
      setFormDate(pickedDate);

      if (ext.supplier_name) {
        const matched = suppliers.find(
          (s) =>
            s.name.toLowerCase() === ext.supplier_name?.toLowerCase().trim(),
        );
        setSupplierMode(matched ? "existing" : "new");
      }

      setStage("review");
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Network error during extraction",
      );
      setStage("capture");
    }
  }

  function handleSubmitForm(formData: FormData) {
    setErrorMsg(null);
    startSubmitTransition(async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        try {
          await enqueueSubmission("expense", formData);
          router.replace("/today?submitted=expense-queued");
          return;
        } catch (e) {
          setErrorMsg(
            e instanceof Error
              ? `Could not queue offline: ${e.message}`
              : "Could not queue offline.",
          );
          return;
        }
      }
      const result = await submitExpense(formData);
      if (result?.error) setErrorMsg(result.error);
    });
  }

  function resetInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  function reset() {
    setStage("capture");
    setImageDataUrl(null);
    setImageMediaType("image/jpeg");
    setFileName(null);
    setExtracted(null);
    setErrorMsg(null);
    setSupplierMode("existing");
    resetInputs();
  }

  if (stage === "capture") {
    return (
      <div className="mx-auto w-full max-w-md flex-1 py-8">
        <h1 className="text-xl font-medium">Log expense</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Hi {baristaName}. Snap a photo of the supplier invoice or receipt
          and the AI will read it for you.
        </p>

        {errorMsg && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <DayPicker
          value={pickedDate}
          onChange={setPickedDate}
          label="Bill date"
        />

        <label
          htmlFor="expense-photo"
          className="mt-4 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-10 text-center transition active:scale-[0.99]"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-strow-ink text-3xl text-white">
            🧾
          </div>
          <div>
            <p className="text-base font-medium">Take photo</p>
            <p className="mt-1 text-xs text-neutral-500">
              Opens the camera
            </p>
          </div>
        </label>
        <input
          id="expense-photo"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {/* Digital copies: PDF from email/WhatsApp, or a screenshot/gallery
            photo. No `capture` attribute, so iPhone offers Photo Library,
            Take Photo, and Choose File (Files app). */}
        <label
          htmlFor="expense-upload"
          className="mt-3 flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-start transition active:scale-[0.99]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xl">
            📎
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Upload photo or file</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Gallery, screenshot, or PDF invoice (up to 3 MB)
            </p>
          </div>
        </label>
        <input
          id="expense-upload"
          ref={uploadInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
    );
  }

  if (stage === "processing") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 py-12">
        {imageDataUrl && !isPdf && (
          <div className="overflow-hidden rounded-2xl border border-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageDataUrl}
              alt="Receipt preview"
              className="max-h-64 w-auto"
            />
          </div>
        )}
        {isPdf && <PdfChip name={fileName} />}
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-strow-ink" />
          {isPdf ? "Reading your PDF..." : "Reading your receipt..."}
        </div>
        <p className="text-xs text-neutral-400">Usually takes 5-10 seconds</p>
      </div>
    );
  }

  const c = extracted?.confidence ?? {};
  const dateConf: Confidence = c.expense_date ?? "medium";
  const supplierConf: Confidence = c.supplier_name ?? "medium";
  const totalConf: Confidence = c.total ?? "medium";
  const subtotalConf: Confidence = c.subtotal ?? "medium";
  const vatConf: Confidence = c.vat_amount ?? "medium";
  const invoiceConf: Confidence = c.invoice_number ?? "medium";
  const paymentConf: Confidence = extracted?.payment_method ? (c.payment_method ?? "medium") : "medium";

  const hintedCategoryId = extracted?.category_hint
    ? categories.find(
        (cat) =>
          cat.name.toLowerCase() === extracted.category_hint?.toLowerCase(),
      )?.id
    : undefined;

  const matchedSupplier = extracted?.supplier_name
    ? suppliers.find(
        (s) =>
          s.name.toLowerCase() === extracted.supplier_name?.toLowerCase().trim(),
      )
    : undefined;

  return (
    <div className="mx-auto w-full max-w-md flex-1 py-8">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-medium">Confirm the expense</h1>
        <button
          type="button"
          onClick={reset}
          className="text-sm text-neutral-500 underline"
        >
          {isPdf ? "Change file" : "Retake"}
        </button>
      </header>

      {imageDataUrl && isPdf && (
        <div className="mb-4">
          <PdfChip name={fileName} />
        </div>
      )}
      {imageDataUrl && !isPdf && (
        <details className="mb-4 rounded-xl border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-600">
            View your photo
          </summary>
          <div className="border-t border-neutral-100 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageDataUrl}
              alt="Your receipt"
              className="w-full rounded-lg"
            />
          </div>
        </details>
      )}

      <p className="mb-4 text-xs text-neutral-500">
        Green = AI confident. Amber = please verify. Red = please correct.
      </p>

      {errorMsg && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <form action={handleSubmitForm} className="space-y-3">
        <input
          type="hidden"
          name="ai_confidence"
          value={JSON.stringify(c)}
        />
        {(extracted?.line_items ?? []).length === 0 && (
          <input type="hidden" name="line_items" value="[]" />
        )}
        <input type="hidden" name="doc_type" value={extracted?.doc_type ?? ""} />
        <input
          type="hidden"
          name="ai_anomalies"
          value={JSON.stringify(extracted?.anomalies ?? null)}
        />
        <input
          type="hidden"
          name="photo_data_url"
          value={imageDataUrl ?? ""}
        />
        <input
          type="hidden"
          name="photo_media_type"
          value={imageMediaType}
        />

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-neutral-600">
              Supplier
            </label>
            <span
              className={`text-[10px] uppercase tracking-wider ${
                supplierConf === "high"
                  ? "text-emerald-600"
                  : supplierConf === "medium"
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {CONFIDENCE_LABEL[supplierConf]}
            </span>
          </div>

          <div className="mb-2 flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSupplierMode("existing")}
              className={`flex-1 rounded-lg px-3 py-1.5 ${
                supplierMode === "existing"
                  ? "bg-strow-ink text-white"
                  : "bg-neutral-100 text-neutral-600"
              }`}
            >
              Existing supplier
            </button>
            <button
              type="button"
              onClick={() => setSupplierMode("new")}
              className={`flex-1 rounded-lg px-3 py-1.5 ${
                supplierMode === "new"
                  ? "bg-strow-ink text-white"
                  : "bg-neutral-100 text-neutral-600"
              }`}
            >
              New supplier
            </button>
          </div>

          {supplierMode === "existing" ? (
            <select
              name="supplier_id"
              defaultValue={matchedSupplier?.id ?? ""}
              required={supplierMode === "existing"}
              className={`w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base focus:outline-none ${CONFIDENCE_BORDER[supplierConf]} focus:border-strow-ink`}
            >
              <option value="">Pick a supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="new_supplier_name"
              type="text"
              defaultValue={extracted?.supplier_name ?? ""}
              required={supplierMode === "new"}
              placeholder="Supplier name"
              className={`w-full rounded-xl border-2 px-3 py-2.5 text-base focus:outline-none ${CONFIDENCE_BORDER[supplierConf]} focus:border-strow-ink`}
            />
          )}
        </div>

        <details
          open={supplierMode === "new"}
          className="rounded-xl border border-neutral-200 bg-white"
        >
          <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-600">
            Supplier details
            <span className="ms-2 text-[11px] text-neutral-400">
              {[
                extracted?.supplier_trn && "TRN",
                extracted?.supplier_phone && "phone",
                extracted?.supplier_address && "address",
                extracted?.supplier_email && "email",
              ]
                .filter(Boolean)
                .join(" · ") || "none on the bill"}
            </span>
          </summary>
          <div className="space-y-2 border-t border-neutral-100 p-3">
            <MiniField label="TRN" name="supplier_trn" defaultValue={extracted?.supplier_trn} inputMode="numeric" />
            <MiniField label="Phone" name="supplier_phone" defaultValue={extracted?.supplier_phone} inputMode="tel" />
            <MiniField label="Email" name="supplier_email" defaultValue={extracted?.supplier_email} inputMode="email" />
            <MiniField label="Address" name="supplier_address" defaultValue={extracted?.supplier_address} />
            <MiniField label="Order ref" name="order_ref" defaultValue={extracted?.order_ref} />
            <MiniField label="Salesperson" name="salesperson" defaultValue={extracted?.salesperson} />
            <MiniField label="Terms" name="payment_terms" defaultValue={extracted?.payment_terms} />
            <p className="text-[11px] text-neutral-400">
              Saved to the supplier&apos;s profile. Existing details are only filled in, never overwritten.
            </p>
          </div>
        </details>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Category{" "}
            {extracted?.category_hint && (
              <span className="text-neutral-400">
                - AI suggests: {extracted.category_hint}
              </span>
            )}
          </label>
          <select
            name="category_id"
            defaultValue={hintedCategoryId ?? ""}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base focus:border-strow-ink focus:outline-none"
          >
            <option value="">Pick a category...</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Date"
          name="expense_date"
          type="date"
          key={formDate}
          defaultValue={formDate}
          confidence={dateConf}
          required
        />
        {extracted?.expense_date &&
          extracted.expense_date !== formDate &&
          extracted.expense_date <= todayDubai() && (
            <button
              type="button"
              onClick={() => setFormDate(extracted.expense_date!)}
              className="-mt-1 w-full rounded-xl bg-amber-50 px-3 py-2 text-left text-xs text-amber-800"
            >
              The bill shows {shortDay(extracted.expense_date)}. Tap to use that date instead.
            </button>
          )}

        <Field
          label="Invoice / Receipt #"
          name="invoice_number"
          type="text"
          defaultValue={extracted?.invoice_number ?? ""}
          confidence={invoiceConf}
        />

        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Subtotal (AED)"
            name="subtotal"
            type="number"
            step="0.01"
            min="0"
            defaultValue={fmtNum(extracted?.subtotal)}
            confidence={subtotalConf}
          />
          <Field
            label="VAT (AED)"
            name="vat_amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={fmtNum(extracted?.vat_amount)}
            confidence={vatConf}
          />
        </div>

        <Field
          label="Total (AED)"
          name="total"
          type="number"
          step="0.01"
          min="0"
          defaultValue={fmtNum(extracted?.total)}
          confidence={totalConf}
          required
        />

        {(extracted?.line_items ?? []).length > 0 && (
          <ItemsReceived
            initial={(extracted?.line_items ?? []) as RawLine[]}
            subtotal={extracted?.subtotal ?? null}
          />
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-neutral-600">
              Paid by
            </label>
            <span
              className={`text-[10px] uppercase tracking-wider ${
                paymentConf === "high"
                  ? "text-emerald-600"
                  : paymentConf === "medium"
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {extracted?.payment_method ? CONFIDENCE_LABEL[paymentConf] : "Please choose"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { v: "cash", label: "Cash" },
                { v: "card", label: "Card" },
                { v: "bank_transfer", label: "Bank transfer" },
                { v: "credit", label: "Credit" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.v}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm has-[:checked]:border-strow-ink has-[:checked]:bg-neutral-100"
              >
                <input
                  type="radio"
                  name="payment_method"
                  value={opt.v}
                  defaultChecked={extracted?.payment_method === opt.v}
                  required
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Notes (optional)
          </label>
          <textarea
            name="notes"
            rows={2}
            defaultValue={extracted?.notes ?? ""}
            placeholder="Anything unusual?"
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full rounded-xl bg-strow-ink px-4 py-3.5 text-base font-medium text-white transition active:scale-95 disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit expense"}
        </button>

        <p className="text-center text-xs text-neutral-400">
          <Link href="/home" className="underline">
            Cancel and go back
          </Link>
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  defaultValue,
  confidence,
  required,
  step,
  min,
}: {
  label: string;
  name: string;
  type: string;
  defaultValue: string;
  confidence: Confidence;
  required?: boolean;
  step?: string;
  min?: string;
}) {
  // An empty box is never "confident" — ask for it instead.
  const empty = !String(defaultValue ?? "").trim();
  if (empty) confidence = "medium";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={name} className="text-xs font-medium text-neutral-600">
          {label}
        </label>
        <span
          className={`text-[10px] uppercase tracking-wider ${
            confidence === "high"
              ? "text-emerald-600"
              : confidence === "medium"
                ? "text-amber-600"
                : "text-red-600"
          }`}
        >
          {empty ? (required ? "Please fill in" : "Not on the bill") : CONFIDENCE_LABEL[confidence]}
        </span>
      </div>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        min={min}
        defaultValue={defaultValue}
        required={required}
        inputMode={type === "number" ? "decimal" : undefined}
        className={`w-full rounded-xl border-2 px-3 py-2.5 text-base focus:outline-none ${CONFIDENCE_BORDER[confidence]} focus:border-strow-ink`}
      />
    </div>
  );
}

function MiniField({
  label,
  name,
  defaultValue,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue: string | null | undefined;
  inputMode?: "numeric" | "tel" | "email";
}) {
  return (
    <label className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <span className="text-[11px] font-medium text-neutral-500">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        inputMode={inputMode}
        className="w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:border-strow-ink focus:outline-none"
      />
    </label>
  );
}

/** Small file card shown instead of an image preview when the bill is a PDF. */
function PdfChip({ name }: { name: string | null }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[11px] font-semibold text-red-600">
        PDF
      </div>
      <p className="min-w-0 truncate text-sm text-neutral-700">
        {name ?? "Invoice.pdf"}
      </p>
    </div>
  );
}
