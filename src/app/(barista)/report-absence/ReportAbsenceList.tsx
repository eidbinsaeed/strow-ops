"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { markAbsent, markPresent } from "./actions";

type Item = { id: string; name: string; code: string | null; absent: boolean };

export function ReportAbsenceList({
  items,
  date,
}: {
  items: Item[];
  date: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function toggle(id: string, absent: boolean) {
    setBusy(id);
    start(async () => {
      if (absent) await markPresent(id, date);
      else await markAbsent(id, date);
      setBusy(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-center gap-2">
        <label className="text-xs uppercase tracking-wider text-neutral-500">
          Date
        </label>
        <input
          type="date"
          defaultValue={date}
          onChange={(e) => {
            if (e.target.value)
              router.push(("/report-absence?date=" + e.target.value) as Route);
          }}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
          No waiters yet. Add them on the owner Staff page with role “Waiter”.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <div>
                <div className="font-medium">{w.name}</div>
                <div className="text-xs text-neutral-500">{w.code ?? ""}</div>
              </div>
              {w.absent ? (
                <button
                  onClick={() => toggle(w.id, true)}
                  disabled={pending && busy === w.id}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  Absent ✕ · undo
                </button>
              ) : (
                <button
                  onClick={() => toggle(w.id, false)}
                  disabled={pending && busy === w.id}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 disabled:opacity-50"
                >
                  Mark absent
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
