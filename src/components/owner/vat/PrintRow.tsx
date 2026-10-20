"use client";

/** "Print this report" as a grouped-list row. */
export function PrintRow({ ar }: { ar: boolean }) {
  return (
    <button type="button" onClick={() => window.print()} className="apple-row flex w-full items-center gap-3 ps-4 text-start text-strow-ink active:bg-neutral-100">
      <span aria-hidden className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-[#6C6C70] text-white">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 9V3h10v6 M7 17H4v-7h16v7h-3 M7 14h10v7H7z" />
        </svg>
      </span>
      <span className="apple-row-body flex min-h-[52px] min-w-0 flex-1 items-center py-2 pe-3.5 text-[17px]">{ar ? "اطبع هذا التقرير" : "Print this report"}</span>
    </button>
  );
}
