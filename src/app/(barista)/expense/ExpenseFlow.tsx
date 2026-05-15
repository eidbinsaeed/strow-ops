"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { submitExpense } from "./actions";
import { enqueueSubmission } from "@/lib/offline/queue";

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
}: {
  baristaName: string;
  suppliers: Supplier[];
  categories: Category[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("capture");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string>("image/jpeg");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [supplierMode, setSupplierMode] = useState<"existing" | "new">(
    "existing",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErrorMsg(null);

    const dataUrl = await fileToBase64(file);
    setImageDataUrl(dataUrl);
    setImageMediaType(file.type || "image/jpeg");
    setStage("processing");

    try {
      const res = await fetch("/api/expense/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          mediaType: file.type || "image/jpeg",
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setErrorMsg(json.error ?? "Extraction failed");
        setStage("capture");
        return;
      }

      const ext = json.extracted as Extracted;
      setExtracted(ext);

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

  function reset() {
    setStage("capture");
    setImageDataUrl(null);
    setExtracted(null);
    setErrorMsg(null);
    setSupplierMode("existing");
    if (fileInputRef.current) fileInputRef.current.value = "";
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

        <label
          htmlFor="expense-photo"
          className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-10 text-center transition active:scale-[0.99]"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-strow-ink text-3xl text-white">
            🧾
          </div>
          <div>
            <p className="text-base font-medium">Take photo</p>
            <p className="mt-1 text-xs text-neutral-500">
              Or pick a photo from your gallery
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
      </div>
    );
  }

  if (stage === "processing") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 py-12">
        {imageDataUrl && (
          <div className="overflow-hidden rounded-2xl border border-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageDataUrl}
              alt="Receipt preview"
              className="max-h-64 w-auto"
            />
          </div>
        )}
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-strow-ink" />
          Reading your receipt...
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
  const paymentConf: Confidence = c.payment_method ?? "medium";

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
          Retake
        </button>
      </header>

      {imageDataUrl && (
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
        <input
          type="hidden"
          name="line_items"
          value={JSON.stringify(extracted?.line_items ?? [])}
        />
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
          defaultValue={extracted?.expense_date ?? ""}
          confidence={dateConf}
          required
        />

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
              {CONFIDENCE_LABEL[paymentConf]}
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
          {CONFIDENCE_LABEL[confidence]}
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
