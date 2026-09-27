"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { submitClosing } from "./actions";
import { enqueueSubmission } from "@/lib/offline/queue";
import { compressImage } from "@/lib/image";
import { DayPicker } from "@/components/barista/DayPicker";
import { CameraIcon } from "@/components/pulse/icons";
import { shortDay, todayDubai } from "@/lib/dates";

type Confidence = "high" | "medium" | "low";

type Anomalies = {
  has_anomaly: boolean;
  flags: string[];
  explanation: string | null;
};

type Extracted = {
  closing_date: string | null;
  cash_total: number | null;
  card_total: number | null;
  online_total: number | null;
  talabat_total?: number | null;
  keeta_total?: number | null;
  beanz_total?: number | null;
  other_online_total?: number | null;
  grand_total: number | null;
  cash_float_start: number | null;
  cash_float_end: number | null;
  notes: string | null;
  confidence?: {
    closing_date?: Confidence;
    cash_total?: Confidence;
    card_total?: Confidence;
    online_total?: Confidence;
    talabat_total?: Confidence;
    keeta_total?: Confidence;
    beanz_total?: Confidence;
    grand_total?: Confidence;
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

function formatAed(n: number) {
  return `AED ${n.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const WD_S = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO_S = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function chipLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WD_S[d.getUTCDay()]} ${d.getUTCDate()} ${MO_S[d.getUTCMonth()]}`;
}

export function CloseFlow({
  baristaName,
  initialDate,
  missingDays = [],
}: {
  baristaName: string;
  initialDate?: string;
  missingDays?: string[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("capture");
  // The day this upload is for. Defaults to today (Dubai); barista only
  // changes it when uploading an older sheet/bill.
  const [pickedDate, setPickedDate] = useState<string>(initialDate ?? todayDubai());
  const [formDate, setFormDate] = useState<string>(pickedDate);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string>("image/jpeg");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cashTotal, setCashTotal] = useState("");
  const [cardTotal, setCardTotal] = useState("");
  // onlineTotal holds "other online" only; the apps have their own fields.
  const [onlineTotal, setOnlineTotal] = useState("");
  const [talabat, setTalabat] = useState("");
  const [keeta, setKeeta] = useState("");
  const [beanz, setBeanz] = useState("");
  const [showOther, setShowOther] = useState(false);
  const [cashFloatStart, setCashFloatStart] = useState("");
  const [cashFloatEnd, setCashFloatEnd] = useState("");

  async function handleFile(file: File) {
    setErrorMsg(null);
    setStage("processing");

    // Downscale + re-encode to JPEG before upload. Full-res phone photos are
    // too large for the extract API and slow over café wifi.
    let dataUrl: string;
    let mediaType: string;
    try {
      const prepared = await compressImage(file);
      dataUrl = prepared.dataUrl;
      mediaType = prepared.mediaType;
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : "Could not read that photo. Please try again.",
      );
      setStage("capture");
      return;
    }
    setImageDataUrl(dataUrl);
    setImageMediaType(mediaType);

    try {
      const res = await fetch("/api/close/extract", {
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
      setCashTotal(fmtNum(ext.cash_total));
      setCardTotal(fmtNum(ext.card_total));
      setTalabat(fmtNum(ext.talabat_total));
      setKeeta(fmtNum(ext.keeta_total));
      setBeanz(fmtNum(ext.beanz_total));
      {
        const known = (ext.talabat_total ?? 0) + (ext.keeta_total ?? 0) + (ext.beanz_total ?? 0);
        const other =
          ext.other_online_total ?? (ext.online_total != null && ext.online_total - known > 0.009 ? ext.online_total - known : null);
        const hasOther = other != null && other > 0;
        setOnlineTotal(hasOther ? fmtNum(Math.round(other * 100) / 100) : "");
        setShowOther(hasOther);
      }
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
    setTalabat("");
    setKeeta("");
    setBeanz("");
    setShowOther(false);
    setCashFloatStart("");
    setCashFloatEnd("");
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (stage === "capture") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-[18px] py-5">
        <div className="flex flex-col gap-1.5 px-1">
          <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-[-1px]">End of day close</h1>
          <p className="text-[15px] leading-relaxed text-neutral-500">
            Hi {baristaName}. Photograph the closing sheet. The numbers fill in for you to confirm.
          </p>
        </div>

        {errorMsg && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}

        <DayPicker value={pickedDate} onChange={setPickedDate} label="Closing for" className="" />

        {missingDays.length > 0 && (
          <div className="flex flex-col gap-2 px-1">
            <p className="text-[13px] text-neutral-500">Days still missing a closing</p>
            <div className="flex flex-wrap gap-2">
              {missingDays.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPickedDate(d)}
                  className={`h-11 rounded-full px-3.5 text-sm font-medium transition active:scale-95 ${
                    pickedDate === d ? "border border-strow-ink bg-strow-ink text-white" : "border border-dashed border-[#B26B00] bg-white text-strow-ink"
                  }`}
                >
                  {chipLabel(d)}
                </button>
              ))}
            </div>
          </div>
        )}

        <label
          htmlFor="close-photo"
          className="pulse-breathe mt-1.5 flex min-h-[240px] flex-1 cursor-pointer flex-col items-center justify-center gap-3.5 rounded-[32px] bg-strow-ink text-white"
        >
          <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-white/10">
            <CameraIcon />
          </span>
          <span className="font-display text-[22px] font-semibold">Take photo</span>
          <span className="text-sm text-[#B9C3D0]">or choose one from your gallery</span>
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

        <p className="text-center text-[13px] leading-relaxed text-neutral-500">The photo stays on this phone until you confirm.</p>
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
  // The day comes from the date chip the barista picked; only flag it when the sheet shows a different day.
  const dateConf: Confidence = extracted?.closing_date && extracted.closing_date !== formDate ? "medium" : "high";

  const onlineSum =
    (parseFloat(talabat) || 0) + (parseFloat(keeta) || 0) + (parseFloat(beanz) || 0) + (parseFloat(onlineTotal) || 0);
  const computedGrand = (parseFloat(cashTotal) || 0) + (parseFloat(cardTotal) || 0) + onlineSum;

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
        <input type="hidden" name="ai_confidence" value={JSON.stringify({ ...c, closing_date: dateConf })} />
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

        <Field
          label="Closing date"
          name="closing_date"
          type="date"
          key={formDate}
          defaultValue={formDate}
          confidence={dateConf}
          required
        />
        {extracted?.closing_date &&
          extracted.closing_date !== formDate &&
          extracted.closing_date <= todayDubai() && (
            <button
              type="button"
              onClick={() => setFormDate(extracted.closing_date!)}
              className="-mt-1 w-full rounded-xl bg-amber-50 px-3 py-2 text-left text-xs text-amber-800"
            >
              The sheet shows {shortDay(extracted.closing_date)}. Tap to use that date instead.
            </button>
          )}

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

        <p className="-mb-1 pt-1 text-xs font-medium uppercase tracking-wider text-neutral-500">Delivery apps</p>
        <ControlledField
          label="Talabat (AED)"
          name="talabat_total"
          value={talabat}
          onChange={setTalabat}
          confidence={c.talabat_total ?? "medium"}
          required={false}
        />
        <ControlledField
          label="Keeta (AED)"
          name="keeta_total"
          value={keeta}
          onChange={setKeeta}
          confidence={c.keeta_total ?? "medium"}
          required={false}
        />
        <ControlledField
          label="Beanz (AED)"
          name="beanz_total"
          value={beanz}
          onChange={setBeanz}
          confidence={c.beanz_total ?? "medium"}
          required={false}
        />
        {showOther ? (
          <ControlledField
            label="Other online (AED)"
            name="other_online_total"
            value={onlineTotal}
            onChange={setOnlineTotal}
            confidence="medium"
            required={false}
          />
        ) : (
          <button type="button" onClick={() => setShowOther(true)} className="-mt-1 block text-xs font-semibold text-strow-blue">
            + Other online payment
          </button>
        )}
        <input type="hidden" name="online_total" value={onlineSum.toFixed(2)} />

        <div className="rounded-2xl bg-neutral-100 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Grand total
            </span>
            <span className="text-[10px] uppercase tracking-wider text-neutral-400">
              cash + card + apps
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
            <p className="text-xs text-neutral-400">
              The AI fills these in if your close sheet shows them. Correct
              them here if they look wrong — leave blank if your sheet has no
              float line.
            </p>
            <ControlledField
              label="Float at start (AED)"
              name="cash_float_start"
              value={cashFloatStart}
              onChange={setCashFloatStart}
              confidence="medium"
            />
            <ControlledField
              label="Float at end (AED)"
              name="cash_float_end"
              value={cashFloatEnd}
              onChange={setCashFloatEnd}
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
