"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function PeriodPicker({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setBoth(from: string, to: string) {
    const next = new URLSearchParams(params);
    next.set("from", from);
    next.set("to", to);
    router.push((`${pathname}?${next.toString()}`) as never);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <label className="text-xs text-neutral-500">Period</label>
      <input
        type="date"
        defaultValue={params.get("from") ?? defaultFrom}
        onChange={(e) => {
          const to = params.get("to") ?? defaultTo;
          setBoth(e.target.value, to);
        }}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-strow-ink focus:outline-none"
      />
      <span className="text-xs text-neutral-400">to</span>
      <input
        type="date"
        defaultValue={params.get("to") ?? defaultTo}
        onChange={(e) => {
          const from = params.get("from") ?? defaultFrom;
          setBoth(from, e.target.value);
        }}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-strow-ink focus:outline-none"
      />
    </div>
  );
}

export function ReportToolbar({ csvHref }: { csvHref: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <a
        href={csvHref}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
      >
        Download CSV
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
