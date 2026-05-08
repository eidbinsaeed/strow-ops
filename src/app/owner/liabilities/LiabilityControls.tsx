"use client";

import { useRef, useState, useTransition } from "react";
import {
  createLiability,
  settleLiability,
  reopenLiability,
} from "./actions";

export function AddLiabilityForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createLiability(formData);
      if (result?.error) setError(result.error);
      else formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4"
    >
      <p className="mb-3 text-sm font-medium">Record a liability</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <input
          name="counterparty"
          placeholder="Who? (customer name, supplier, etc.)"
          required
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <select
          name="kind"
          defaultValue="customer_held"
          disabled={isPending}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        >
          <option value="customer_held">Customer money held</option>
          <option value="iou">IOU we owe</option>
          <option value="deferred_payment">Deferred payment</option>
        </select>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0"
          placeholder="Amount in AED"
          required
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <input
          name="incurred_date"
          type="date"
          defaultValue={today}
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <input
          name="notes"
          placeholder="Notes (optional)"
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none md:col-span-2"
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Recording…" : "Record liability"}
        </button>
      </div>
    </form>
  );
}

export function LiabilityRowActions({
  id,
  isSettled,
  counterparty,
}: {
  id: string;
  isSettled: boolean;
  counterparty: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSettle() {
    if (!window.confirm(`Mark "${counterparty}" liability as settled?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await settleLiability(id);
      if (result?.error) setError(result.error);
    });
  }

  function handleReopen() {
    setError(null);
    startTransition(async () => {
      const result = await reopenLiability(id);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {isSettled ? (
        <button
          type="button"
          onClick={handleReopen}
          disabled={isPending}
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
        >
          Reopen
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSettle}
          disabled={isPending}
          className="rounded-md border border-emerald-200 px-2.5 py-1 text-xs text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
        >
          Mark settled
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
