"use client";

import { useRef } from "react";
import { shortDay, todayDubai } from "@/lib/dates";

/**
 * Date chip shown before the photo step. Defaults to today (Dubai) so the
 * normal case is zero taps; tapping opens the native date picker for
 * back-dated uploads. Future dates are blocked.
 */
export function DayPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const today = todayDubai();
  const isToday = value === today;

  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-medium text-neutral-500">{label}</p>
      <button
        type="button"
        onClick={() => (ref.current?.showPicker ? ref.current.showPicker() : ref.current?.focus())}
        className={`relative flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.99] ${
          isToday ? "border-neutral-200 bg-white" : "border-amber-300 bg-amber-50"
        }`}
      >
        <span>
          <span className="block text-base font-medium">
            {isToday ? "Today" : shortDay(value)}
          </span>
          <span className="block text-xs text-neutral-500">
            {isToday ? shortDay(value) : "Uploading for an earlier day"}
          </span>
        </span>
        <span className="text-sm font-medium text-neutral-500">Change</span>
        <input
          ref={ref}
          type="date"
          value={value}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="pointer-events-none absolute inset-0 opacity-0"
          tabIndex={-1}
          aria-label={label}
        />
      </button>
      {!isToday && (
        <button type="button" onClick={() => onChange(today)} className="mt-2 text-xs text-neutral-500 underline">
          Back to today
        </button>
      )}
    </div>
  );
}
