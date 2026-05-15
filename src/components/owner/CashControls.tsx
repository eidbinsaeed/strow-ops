"use client";

import { useRef, useState, useTransition } from "react";
import { recordCashWithdrawal, recordCashCount } from "@/app/owner/cash/actions";
import { tr } from "@/lib/i18n/tr";
import type { Locale } from "@/lib/i18n/dict";

function aed(n: number) {
  return `AED ${Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type OpenForm = "withdraw" | "count" | null;

/**
 * Dashboard card: running cash-on-hand balance plus the two manual cash
 * controls — "take cash out" (a withdrawal) and "recount / set balance"
 * (a count; enter 0 to zero out). Both call server actions that write a
 * cash_events row; the v_cash_position view recomputes the balance.
 */
export function CashControls({
  cashOnHand,
  cashInToday,
  cashOutToday,
  cashWithdrawnToday,
  anchorDate,
  needsOpeningCount,
  locale,
}: {
  cashOnHand: number;
  cashInToday: number;
  cashOutToday: number;
  cashWithdrawnToday: number;
  anchorDate: string | null;
  needsOpeningCount: boolean;
  locale: Locale;
}) {
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const withdrawRef = useRef<HTMLFormElement>(null);
  const countRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  function submitWithdraw(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await recordCashWithdrawal(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        withdrawRef.current?.reset();
        setOpenForm(null);
      }
    });
  }

  function submitCount(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await recordCashCount(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        countRef.current?.reset();
        setOpenForm(null);
      }
    });
  }

  function toggle(form: Exclude<OpenForm, null>) {
    setError(null);
    setOpenForm((current) => (current === form ? null : form));
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {tr("cash.title", locale)}
          </p>
          <p className="mt-1 text-4xl font-light tabular-nums text-strow-ink">
            {aed(cashOnHand)}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {tr("cash.subtitle", locale)}
            {anchorDate
              ? ` · ${tr("cash.last_counted", locale)} ${anchorDate}`
              : ""}
          </p>
        </div>
        <div className="flex flex-col gap-1 text-right text-xs tabular-nums">
          <span className="text-emerald-700">
            +{aed(cashInToday)} {tr("cash.in_today", locale)}
          </span>
          <span className="text-red-700">
            -{aed(cashOutToday + cashWithdrawnToday)}{" "}
            {tr("cash.out_today", locale)}
          </span>
        </div>
      </div>

      {needsOpeningCount && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {tr("cash.needs_opening", locale)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggle("withdraw")}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
        >
          {tr("cash.take_out", locale)}
        </button>
        <button
          type="button"
          onClick={() => toggle("count")}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
        >
          {tr("cash.recount", locale)}
        </button>
      </div>

      {openForm === "withdraw" && (
        <form
          ref={withdrawRef}
          action={submitWithdraw}
          className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
        >
          <p className="mb-2 text-sm font-medium">{tr("cash.take_out", locale)}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount in AED"
              required
              disabled={isPending}
              inputMode="decimal"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
            />
            <input
              name="event_date"
              type="date"
              defaultValue={today}
              disabled={isPending}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
            />
            <input
              name="notes"
              placeholder="Notes — e.g. moved to bank (optional)"
              disabled={isPending}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none sm:col-span-2"
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Take out"}
            </button>
          </div>
        </form>
      )}

      {openForm === "count" && (
        <form
          ref={countRef}
          action={submitCount}
          className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
        >
          <p className="mb-1 text-sm font-medium">{tr("cash.recount", locale)}</p>
          <p className="mb-2 text-xs text-neutral-500">
            Enter the actual cash you counted — this becomes the new running
            balance. Enter 0 to zero out.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="Counted amount in AED"
              required
              disabled={isPending}
              inputMode="decimal"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
            />
            <input
              name="event_date"
              type="date"
              defaultValue={today}
              disabled={isPending}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
            />
            <input
              name="notes"
              placeholder="Notes (optional)"
              disabled={isPending}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none sm:col-span-2"
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save count"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
