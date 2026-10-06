"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PeriodLinks } from "@/lib/period";

/**
 * Day · Week · Month · Pick dates, with ‹ › to step back and forward.
 * Links are built on the server (periodLinks); only the date inputs need the browser.
 */
export function PeriodBar({
  links,
  label,
  tag,
  custom,
  from,
  to,
  min,
  max,
  locale,
  note,
}: {
  links: PeriodLinks;
  label: string;
  tag: string;
  custom: boolean;
  from: string;
  to: string;
  min?: string | null;
  max: string;
  locale: "en" | "ar";
  note?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ar = locale === "ar";

  function pick(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) return;
    const q = new URLSearchParams(params.toString());
    q.set("p", "custom");
    q.delete("d");
    q.set("from", nextFrom <= nextTo ? nextFrom : nextTo);
    q.set("to", nextFrom <= nextTo ? nextTo : nextFrom);
    router.push(`${pathname}?${q.toString()}` as Route);
  }

  const arrow = (href: string | null, back: boolean) => {
    const cls = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EEF0F3] text-strow-ink transition";
    const icon = (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={back ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    );
    const name = back ? (ar ? "الفترة السابقة" : "Previous period") : ar ? "الفترة التالية" : "Next period";
    return href ? (
      <Link href={href as Route} aria-label={name} className={`${cls} hover:bg-[#E1E5EA] active:scale-95`} scroll={false}>
        {icon}
      </Link>
    ) : (
      <span aria-label={name} aria-disabled="true" role="link" className={`${cls} opacity-35`}>
        {icon}
      </span>
    );
  };

  return (
    <section aria-label={ar ? "الفترة" : "Period"} className="flex flex-wrap items-center justify-between gap-2.5 rounded-[24px] bg-white p-3 print:hidden">
      <div className="-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none]">
        <div className="inline-flex gap-1 rounded-full bg-[#EEF0F3] p-1">
          {links.grains.map((g) => (
            <Link
              key={g.grain}
              href={g.href as Route}
              scroll={false}
              aria-current={g.active ? "true" : undefined}
              className={`flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-sm transition ${
                g.active ? "bg-strow-ink font-semibold text-white" : "text-neutral-600 hover:text-strow-ink"
              }`}
            >
              {g.label}
            </Link>
          ))}
        </div>
      </div>

      {custom ? (
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            {ar ? "من" : "From"}
            <input
              key={`from-${from}`}
              type="date"
              defaultValue={from}
              min={min ?? undefined}
              max={max}
              onChange={(e) => pick(e.target.value, to)}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-2.5 text-[15px] text-strow-ink focus:border-strow-ink focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            {ar ? "إلى" : "To"}
            <input
              key={`to-${to}`}
              type="date"
              defaultValue={to}
              min={min ?? undefined}
              max={max}
              onChange={(e) => pick(from, e.target.value)}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-2.5 text-[15px] text-strow-ink focus:border-strow-ink focus:outline-none"
            />
          </label>
          <span className="pb-3 text-[13px] text-neutral-500">{tag}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {arrow(links.back, true)}
          <div className="flex min-w-[150px] flex-col items-center gap-px text-center">
            <span className="text-[15px] font-semibold">{label}</span>
            <span className="text-xs text-neutral-500">{note ?? tag}</span>
          </div>
          {arrow(links.fwd, false)}
        </div>
      )}
    </section>
  );
}
