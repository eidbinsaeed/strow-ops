"use client";

import { useState, useTransition } from "react";
import {
  confirmReviewItem,
  rejectReviewItem,
  deleteReviewItem,
  editClosing,
  editExpense,
  type ItemType,
} from "./actions";

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
  | { type: "closing"; id: string; fields: ClosingFields }
  | { type: "expense"; id: string; fields: ExpenseFields };

export function ReviewRowActions(props: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
    });
  }

  function handleConfirm() {
    run(() => confirmReviewItem(props.type, props.id));
  }

  function handleReject() {
    if (!window.confirm("Mark as rejected? This stays in the audit log.")) return;
    run(() => rejectReviewItem(props.type, props.id));
  }

  function handleDelete() {
    if (
      !window.confirm(
        "Permanently delete this submission? Audit log keeps the snapshot.",
      )
    ) {
      return;
    }
    run(() => deleteReviewItem(props.type, props.id));
  }

  function handleEditSubmit(formData: FormData) {
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
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={handleConfirm}
        className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition active:scale-95 disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setEditing(true)}
        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition active:scale-95 disabled:opacity-50"
      >
        Edit
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={handleReject}
        className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition active:scale-95 disabled:opacity-50"
      >
        Reject
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={handleDelete}
        className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition active:scale-95 disabled:opacity-50"
      >
        Delete
      </button>
      {error && (
        <span className="ml-2 text-xs text-red-700">{error}</span>
      )}
      {editing && (
        <EditDialog
          {...props}
          onClose={() => setEditing(false)}
          onSubmit={handleEditSubmit}
          pending={pending}
        />
      )}
    </div>
  );
}

function EditDialog(
  props: Props & {
    onClose: () => void;
    onSubmit: (formData: FormData) => void;
    pending: boolean;
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
            Edit {isClosing ? "closing" : "expense"}
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            className="text-sm text-neutral-400 hover:text-neutral-700"
          >
            Cancel
          </button>
        </div>

        <form action={props.onSubmit} className="space-y-3">
          {isClosing ? (
            <ClosingFormFields fields={(props as Props & { type: "closing" }).fields} />
          ) : (
            <ExpenseFormFields fields={(props as Props & { type: "expense" }).fields} />
          )}

          <button
            type="submit"
            disabled={props.pending}
            className="mt-2 w-full rounded-xl bg-strow-ink px-4 py-2.5 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
          >
            {props.pending ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ClosingFormFields({ fields }: { fields: ClosingFields }) {
  return (
    <>
      <Label name="closing_date" label="Closing date">
        <input
          name="closing_date"
          type="date"
          defaultValue={fields.closing_date}
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
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
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
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
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
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
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
      </Label>
      <Label name="notes" label="Notes">
        <textarea
          name="notes"
          defaultValue={fields.notes ?? ""}
          rows={2}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
      </Label>
    </>
  );
}

function ExpenseFormFields({ fields }: { fields: ExpenseFields }) {
  return (
    <>
      <Label name="expense_date" label="Expense date">
        <input
          name="expense_date"
          type="date"
          defaultValue={fields.expense_date}
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
      </Label>
      <Label name="invoice_number" label="Invoice number">
        <input
          name="invoice_number"
          type="text"
          defaultValue={fields.invoice_number ?? ""}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
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
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
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
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
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
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
      </Label>
      <Label name="payment_method" label="Payment method">
        <select
          name="payment_method"
          defaultValue={fields.payment_method}
          required
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
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
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
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
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-neutral-600">
        {label}
      </label>
      {children}
    </div>
  );
}

// Suppress unused vars when narrowing prevents using ItemType here.
export type { ItemType };
