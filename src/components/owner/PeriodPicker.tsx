"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { tr } from "@/lib/i18n/tr";
import { useLocale } from "./LocaleProvider";

export function PeriodPicker({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const locale = useLocale();
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
      <label className="text-xs text-neutral-500">{tr("report.period", locale)}</label>
      <input
        type="date"
        defaultValue={params.get("from") ?? defaultFrom}
        onChange={(e) => {
          const to = params.get("to") ?? defaultTo;
          setBoth(e.target.value, to);
        }}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-strow-ink focus:outline-none"
      />
      <span className="text-xs text-neutral-400">{tr("filter.between", locale)}</span>
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
  const locale = useLocale();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <a
        href={csvHref}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
      >
        {tr("report.download_csv", locale)}
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
      >
        {tr("report.print_pdf", locale)}
      </button>
    </div>
  );
}
