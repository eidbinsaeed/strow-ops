"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { submitClosing } from "./actions";

type Confidence = "high" | "medium" | "low";

type Extracted = {
  closing_date: string | null;
  cash_total: number | null;
  card_total: number | null;
  online_total: number | null;
  grand_total: number | null;
  cash_float_start: number | null;
  cash_float_end: number | null;
  notes: string | null;
  confidence?: {
    closing_date?: Confidence;
    cash_total?: Confidence;
    card_total?: Confidence;
    online_total?: Confidence;
    grand_total?: Confidence;
  };
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

export function CloseFlow({ baristaName }: { baristaName: string }) {
  const [stage, setStage] = useState<Stage>("capture");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string>("image/jpeg");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErrorMsg(null);
    setImageMediaType(file.type || "image/jpeg");

    const dataUrl = await fileToBase64(file);
    setImageDataUrl(dataUrl);
    setStage("processing");

    try {
      const res = await fetch("/api/close/extract", {
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

      setExtracted(json.extracted as Extracted);
      setStage("review");
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Network error during extraction"
      );
      setStage("capture");
    }
  }

  function handleSubmitForm(formData: FormData) {
    setErrorMsg(null);
    startSubmitTransition(async () => {
      const result = await submitClosing(formData);
      // submitClosing redirects on success, so we only get here on error
      if (result?.error) {
        setErrorMsg(result.error);
      }
    });
  }

  function reset() {
    setStage("capture");
    setImageDataUrl(null);
    setExtracted(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ─── STAGE: CAPTURE ────────────────────────────────────────────
  if (stage === "capture") {
    return (
      <div className="mx-auto w-full max-w-md flex-1 py-8">
        <h1 className="text-xl font-medium">End of day close</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Hi {baristaName}. Snap a photo of your close sheet and the AI will
          fill in the numbers for you to confirm.
        </p>

        {errorMsg && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <label
          htmlFor="close-photo"
          className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-10 text-center transition active:scale-[0.99]"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-strow-ink text-3xl text-white">
            📷
          </div>
          <div>
            <p className="text-base font-medium">Take photo</p>
            <p className="mt-1 text-xs text-neutral-500">
              Or pick a photo from your gallery
            </p>
          </div>
        </label>
        <input
          id="close-photo"
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

        <p className="mt-6 text-xs text-neutral-400">
          Photo stays on your phone until you confirm. AI extraction takes about
          5 seconds.
        </p>
      </div>
    );
  }

  // ─── STAGE: PROCESSING ─────────────────────────────────────────
  if (stage === "processing") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 py-12">
        {imageDataUrl && (
          <div className="overflow-hidden rounded-2xl border border-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageDataUrl}
              alt="Close sheet preview"
              className="max-h-64 w-auto"
            />
          </div>
        )}
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-strow-ink" />
          Reading your close sheet…
        </div>
        <p className="text-xs text-neutral-400">Usually takes 5–10 seconds</p>
      </div>
    );
  }

  // ─── STAGE: REVIEW ─────────────────────────────────────────────
  const c = extracted?.confidence ?? {};
  const cashConf: Confidence = c.cash_total ?? "medium";
  const cardConf: Confidence = c.card_total ?? "medium";
  const onlineConf: Confidence = c.online_total ?? "medium";
  const grandConf: Confidence = c.grand_total ?? "medium";
  const dateConf: Confidence = c.closing_date ?? "medium";

  return (
    <div className="mx-auto w-full max-w-md flex-1 py-8">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-medium">Confirm the numbers</h1>
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
              alt="Your close sheet"
              className="w-full rounded-lg"
            />
          </div>
        </details>
      )}

      <p className="mb-4 text-xs text-neutral-500">
        Green = AI is confident · Amber = please verify · Red = please correct
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

        <Field
          label="Closing date"
          name="closing_date"
          type="date"
          defaultValue={extracted?.closing_date ?? ""}
          confidence={dateConf}
          required
        />

        <Field
          label="Cash total (AED)"
          name="cash_total"
          type="number"
          step="0.01"
          min="0"
          defaultValue={fmtNum(extracted?.cash_total)}
          confidence={cashConf}
          required
        />

        <Field
          label="Card total (AED)"
          name="card_total"
          type="number"
          step="0.01"
          min="0"
          defaultValue={fmtNum(extracted?.card_total)}
          confidence={cardConf}
          required
        />

        <Field
          label="Online total (AED)"
          name="online_total"
          type="number"
          step="0.01"
          min="0"
          defaultValue={fmtNum(extracted?.online_total)}
          confidence={onlineConf}
          required
        />

        <Field
          label="Grand total (AED)"
          name="grand_total"
          type="number"
          step="0.01"
          min="0"
          defaultValue={fmtNum(extracted?.grand_total)}
          confidence={grandConf}
          required
        />

        <details className="rounded-xl border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-600">
            Cash float (optional)
          </summary>
          <div className="space-y-3 p-3">
            <Field
              label="Float at start (AED)"
              name="cash_float_start"
              type="number"
              step="0.01"
              min="0"
              defaultValue={fmtNum(extracted?.cash_float_start)}
              confidence="medium"
            />
            <Field
              label="Float at end (AED)"
              name="cash_float_end"
              type="number"
              step="0.01"
              min="0"
              defaultValue={fmtNum(extracted?.cash_float_end)}
              confidence="medium"
            />
          </div>
        </details>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Notes (optional)
          </label>
          <textarea
            name="notes"
            rows={2}
            defaultValue={extracted?.notes ?? ""}
            placeholder="Anything unusual about today?"
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full rounded-xl bg-strow-ink px-4 py-3.5 text-base font-medium text-white transition active:scale-95 disabled:opacity-50"
        >
          {isSubmitting ? "Submitting…" : "Submit closing"}
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
        className={`w-full rounded-xl border-2 px-3 py-2.5 text-base focus:outline-none ${
          CONFIDENCE_BORDER[confidence]
        } focus:border-strow-ink`}
      />
    </div>
  );
}
