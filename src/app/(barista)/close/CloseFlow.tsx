"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { submitClosing } from "./actions";
import { enqueueSubmission } from "@/lib/offline/queue";

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

function formatAed(n: number) {
  return `AED ${n.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function CloseFlow({ baristaName }: { baristaName: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("capture");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string>("image/jpeg");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cashTotal, setCashTotal] = useState("");
  const [cardTotal, setCardTotal] = useState("");
  const [onlineTotal, setOnlineTotal] = useState("");
  const [cashFloatStart, setCashFloatStart] = useState("");
  const [cashFloatEnd, setCashFloatEnd] = useState("");

  async function handleFile(file: File) {
    setErrorMsg(null);

    const dataUrl = await fileToBase64(file);
    setImageDataUrl(dataUrl);
    setImageMediaType(file.type || "image/jpeg");
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

      const ext = json.extracted as Extracted;
      setExtracted(ext);
      setCashTotal(fmtNum(ext.cash_total));
      setCardTotal(fmtNum(ext.card_total));
      setOnlineTotal(fmtNum(ext.online_total));
      setCashFloatStart(fmtNum(ext.cash_float_start));
      setCashFloatEnd(fmtNum(ext.cash_float_end));
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
      // Offline? Stash the submission for later replay.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        try {
          await enqueueSubmission("closing", formData);
          router.replace("/today?submitted=closing-queued");
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
      const result = await submitClosing(formData);
      if (result?.error) setErrorMsg(result.error);
    });
  }

  function reset() {
    setStage("capture");
    setImageDataUrl(null);
    setExtracted(null);
    setCashTotal("");
    setCardTotal("");
    setOnlineTotal("");
    setCashFloatStart("");
    setCashFloatEnd("");
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

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
          Photo stays on your phone until you confirm. AI extraction takes
          about 5 seconds.
        </p>
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
              alt="Close sheet preview"
              className="max-h-64 w-auto"
            />
          </div>
        )}
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-strow-ink" />
          Reading your close sheet...
        </div>
        <p className="text-xs text-neutral-400">Usually takes 5-10 seconds</p>
      </div>
    );
  }

  const c = extracted?.confidence ?? {};
  const cashConf: Confidence = c.cash_total ?? "medium";
  const cardConf: Confidence = c.card_total ?? "medium";
  const onlineConf: Confidence = c.online_total ?? "medium";
  const dateConf: Confidence = c.closing_date ?? "medium";

  const computedGrand =
    (parseFloat(cashTotal) || 0) +
    (parseFloat(cardTotal) || 0) +
    (parseFloat(onlineTotal) || 0);

  const aiGrand = extracted?.grand_total ?? null;
  const grandMatchesAi =
    aiGrand == null || Math.abs(computedGrand - aiGrand) < 0.02;

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
        Green = AI is confident. Amber = please verify. Red = please correct.
      </p>

      {errorMsg && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <form action={handleSubmitForm} className="space-y-3">
        <input type="hidden" name="ai_confidence" value={JSON.stringify(c)} />
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

        <Field
          label="Closing date"
          name="closing_date"
          type="date"
          defaultValue={extracted?.closing_date ?? ""}
          confidence={dateConf}
          required
        />

        <input type="hidden" name="cash_float_start" value={cashFloatStart} />
        <input type="hidden" name="cash_float_end" value={cashFloatEnd} />
        <ControlledField
          label="Cash total (AED)"
          name="cash_total"
          value={cashTotal}
          onChange={setCashTotal}
          confidence={cashConf}
          required
        />

        <ControlledField
          label="Card total (AED)"
          name="card_total"
          value={cardTotal}
          onChange={setCardTotal}
          confidence={cardConf}
          required
        />

        <ControlledField
          label="Online total (AED)"
          name="online_total"
          value={onlineTotal}
          onChange={setOnlineTotal}
          confidence={onlineConf}
          required
        />

        <div className="rounded-2xl bg-neutral-100 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Grand total
            </span>
            <span className="text-[10px] uppercase tracking-wider text-neutral-400">
              auto from cash + card + online
            </span>
          </div>
          <p className="mt-1 text-2xl font-light tabular-nums">
            {formatAed(computedGrand)}
          </p>
          {!grandMatchesAi && aiGrand != null && (
            <p className="mt-2 text-xs text-amber-700">
              AI read the grand total as {formatAed(aiGrand)} on the receipt.
              The breakdown above adds up to {formatAed(computedGrand)}. Double
              check one of the sub-totals.
            </p>
          )}
        </div>

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
          {isSubmitting ? "Submitting..." : "Submit closing"}
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

function ControlledField({
  label,
  name,
  value,
  onChange,
  confidence,
  required,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  confidence: Confidence;
  required?: boolean;
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
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        inputMode="decimal"
        className={`w-full rounded-xl border-2 px-3 py-2.5 text-base focus:outline-none ${
          CONFIDENCE_BORDER[confidence]
        } focus:border-strow-ink`}
      />
    </div>
  );
}
