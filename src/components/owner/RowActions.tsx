"use client";

import { useState, useTransition } from "react";
import { tr } from "@/lib/i18n/tr";
import { useLocale } from "@/components/owner/LocaleProvider";
import {
  confirmReviewItem,
  rejectReviewItem,
  deleteReviewItem,
  sendToPending,
  editClosing,
  editExpense,
  type ItemType,
} from "@/app/owner/review/actions";

type ClosingFields = {
  closing_date: string;
  cash_total: number;
  card_total: number;
  online_total: number;
  notes: string | null;
};

type ExpenseFields = {
  expense_date: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_method: string;
  invoice_number: string | null;
  notes: string | null;
};

type Props =
  | {
      type: "closing";
      id: string;
      status: string;
      fields: ClosingFields;
      photoDriveUrl: string | null;
    }
  | {
      type: "expense";
      id: string;
      status: string;
      fields: ExpenseFields;
      photoDriveUrl: string | null;
    };

function driveFileIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/);
  return m?.[1] ?? null;
}

export function RowActions(props: Props) {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);

  const isPending =
    props.status === "pending_review" || props.status === "flagged";
  const isConfirmed = props.status === "confirmed";
  const driveFileId = driveFileIdFromUrl(props.photoDriveUrl);

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.photoDriveUrl && (
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition active:scale-95"
        >
          {tr("action.view_bill", locale)}
        </button>
      )}

      {isPending && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => confirmReviewItem(props.type, props.id))}
          className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition active:scale-95 disabled:opacity-50"
        >
          {tr("action.confirm", locale)}
        </button>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => setEditing(true)}
        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition active:scale-95 disabled:opacity-50"
      >
        {tr("action.edit", locale)}
      </button>

      {isConfirmed && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              !window.confirm(
                tr("action.confirm_send_pending", locale),
              )
            )
              return;
            run(() => sendToPending(props.type, props.id));
          }}
          className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition active:scale-95 disabled:opacity-50"
        >
          {tr("action.send_to_pending", locale)}
        </button>
      )}

      {isPending && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(tr("action.confirm_reject", locale)))
              return;
            run(() => rejectReviewItem(props.type, props.id));
          }}
          className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition active:scale-95 disabled:opacity-50"
        >
          {tr("action.reject", locale)}
        </button>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              tr("action.confirm_delete", locale),
            )
          )
            return;
          run(() => deleteReviewItem(props.type, props.id));
        }}
        className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition active:scale-95 disabled:opacity-50"
      >
        {tr("action.delete", locale)}
      </button>

      {error && <span className="ml-2 text-xs text-red-700">{error}</span>}

      {viewing && driveFileId && (
        <ViewBillModal
          fileId={driveFileId}
          driveUrl={props.photoDriveUrl ?? ""}
          onClose={() => setViewing(false)}
          locale={locale}
        />
      )}

      {editing && (
        <EditDialog
          {...props}
          locale={locale}
          onClose={() => setEditing(false)}
          onSubmit={(formData) => {
            setError(null);
            startTransition(async () => {
              const r =
                props.type === "closing"
                  ? await editClosing(props.id, formData)
                  : await editExpense(props.id, formData);
              if (r?.error) {
                setError(r.error);
                return;
              }
              setEditing(false);
            });
          }}
          pending={pending}
        />
      )}
    </div>
  );
}

function ViewBillModal({
  fileId,
  driveUrl,
  onClose,
  locale,
}: {
  fileId: string;
  driveUrl: string;
  onClose: () => void;
  locale: import("@/lib/i18n/dict").Locale;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-medium">{tr("action.view_bill", locale)}</h2>
          <div className="flex items-center gap-3 text-xs">
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-500 underline hover:text-strow-ink"
            >
              {tr("action.open_in_drive", locale)}
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-100"
            >
              {tr("common.close", locale)}
            </button>
          </div>
        </div>
        <iframe
          src={`https://drive.google.com/file/d/${fileId}/preview`}
          className="flex-1 w-full"
          allow="autoplay"
          title={tr("action.view_bill", locale)}
        />
      </div>
    </div>
  );
}

function EditDialog(
  props: Props & {
    onClose: () => void;
    onSubmit: (formData: FormData) => void;
    pending: boolean;
    locale: import("@/lib/i18n/dict").Locale;
  },
) {
  const isClosing = props.type === "closing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={props.onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">
            {tr("action.edit", props.locale)}
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            className="text-sm text-neutral-400 hover:text-neutral-700"
          >
            {tr("common.cancel", props.locale)}
          </button>
        </div>

        <form action={props.onSubmit} className="space-y-3">
          {isClosing ? (
            <ClosingFormFields
              fields={(props as Props & { type: "closing" }).fields}
            />
          ) : (
            <ExpenseFormFields
              fields={(props as Props & { type: "expense" }).fields}
            />
          )}

          <button
            type="submit"
            disabled={props.pending}
            className="mt-2 w-full rounded-xl bg-strow-ink px-4 py-2.5 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
          >
            {props.pending ? tr("common.saving", props.locale) : tr("common.save", props.locale)}
          </button>
        </form>
      </div>
    </div>
  );
}

function inputClass() {
  return "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none";
}

function ClosingFormFields({ fields }: { fields: ClosingFields }) {
  return (
    <>
      <Label name="closing_date" label="Sale date">
        <input
          name="closing_date"
          type="date"
          defaultValue={fields.closing_date}
          required
          className={inputClass()}
        />
      </Label>
      <Label name="cash_total" label="Cash total (AED)">
        <input
          name="cash_total"
          type="number"
          step="0.01"
          min="0"
          defaultValue={fields.cash_total}
          required
          inputMode="decimal"
          className={inputClass()}
        />
      </Label>
      <Label name="card_total" label="Card total (AED)">
        <input
          name="card_total"
          type="number"
          step="0.01"
          min="0"
          defaultValue={fields.card_total}
          required
          inputMode="decimal"
          className={inputClass()}
        />
      </Label>
      <Label name="online_total" label="Online total (AED)">
        <input
          name="online_total"
          type="number"
          step="0.01"
          min="0"
          defaultValue={fields.online_total}
          required
          inputMode="decimal"
          className={inputClass()}
        />
      </Label>
      <Label name="notes" label="Notes">
        <textarea
          name="notes"
          defaultValue={fields.notes ?? ""}
          rows={2}
          className={inputClass()}
        />
      </Label>
    </>
  );
}

function ExpenseFormFields({ fields }: { fields: ExpenseFields }) {
  return (
    <>
      <Label name="expense_date" label="Bill date">
        <input
          name="expense_date"
          type="date"
          defaultValue={fields.expense_date}
          required
          className={inputClass()}
        />
      </Label>
      <Label name="invoice_number" label="Invoice number">
        <input
          name="invoice_number"
          type="text"
          defaultValue={fields.invoice_number ?? ""}
          className={inputClass()}
        />
      </Label>
      <Label name="subtotal" label="Subtotal (AED)">
        <input
          name="subtotal"
          type="number"
          step="0.01"
          min="0"
          defaultValue={fields.subtotal}
          inputMode="decimal"
          className={inputClass()}
        />
      </Label>
      <Label name="vat_amount" label="VAT (AED)">
        <input
          name="vat_amount"
          type="number"
          step="0.01"
          min="0"
          defaultValue={fields.vat_amount}
          inputMode="decimal"
          className={inputClass()}
        />
      </Label>
      <Label name="total" label="Total (AED)">
        <input
          name="total"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={fields.total}
          required
          inputMode="decimal"
          className={inputClass()}
        />
      </Label>
      <Label name="payment_method" label="Payment method">
        <select
          name="payment_method"
          defaultValue={fields.payment_method}
          required
          className={inputClass()}
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="credit">Credit</option>
        </select>
      </Label>
      <Label name="notes" label="Notes">
        <textarea
          name="notes"
          defaultValue={fields.notes ?? ""}
          rows={2}
          className={inputClass()}
        />
      </Label>
    </>
  );
}

function Label({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1 block text-xs font-medium text-neutral-600"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
