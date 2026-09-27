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
  className = "mt-6",
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const today = todayDubai();
  const isToday = value === today;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <p className="px-1 text-[13px] font-semibold text-neutral-500">{label}</p>
      <button
        type="button"
        onClick={() => (ref.current?.showPicker ? ref.current.showPicker() : ref.current?.focus())}
        className={`relative flex min-h-[72px] w-full items-center justify-between rounded-3xl border-[1.5px] px-[18px] py-3 text-start transition active:scale-[0.99] ${
          isToday ? "border-neutral-300 bg-white" : "border-[#B26B00] bg-[#FDF3E1]"
        }`}
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-display text-xl font-semibold">{isToday ? "Today" : shortDay(value)}</span>
          <span className="text-[13px] text-neutral-500">{isToday ? shortDay(value) : "Earlier day"}</span>
        </span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-strow-ink">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>
          Change
        </span>
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
        <button type="button" onClick={() => onChange(today)} className="self-start px-1 text-[13px] font-semibold text-strow-blue">
          Back to today
        </button>
      )}
    </div>
  );
}
