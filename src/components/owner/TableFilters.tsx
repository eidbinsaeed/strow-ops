"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { tr } from "@/lib/i18n/tr";
import { useLocale } from "./LocaleProvider";

type Props = {
  /** Show status pills filter */
  showStatus?: boolean;
  /** Show search box */
  showSearch?: boolean;
  /** Placeholder for search input. If omitted, defaults to localized "Search..." */
  searchPlaceholder?: string;
  /** Show date range filter */
  showDates?: boolean;
};

const STATUS_OPTIONS: { v: string; key: "status.confirmed" | "status.pending" | "status.flagged" | "status.rejected"; cls: string }[] = [
  { v: "confirmed", key: "status.confirmed", cls: "bg-emerald-50 text-emerald-700" },
  { v: "pending_review", key: "status.pending", cls: "bg-amber-50 text-amber-700" },
  { v: "flagged", key: "status.flagged", cls: "bg-red-50 text-red-700" },
  { v: "rejected", key: "status.rejected", cls: "bg-neutral-100 text-neutral-500" },
];

export function TableFilters({
  showStatus = true,
  showSearch = true,
  searchPlaceholder,
  showDates = true,
}: Props) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value == null || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    startTransition(() => {
      router.push((`${pathname}?${next.toString()}`) as never);
    });
  }

  function toggleStatus(s: string) {
    const current = (params.get("status") || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const next = current.includes(s)
      ? current.filter((x) => x !== s)
      : [...current, s];
    setParam("status", next.length ? next.join(",") : null);
  }

  const activeStatuses = (params.get("status") || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const hasAnyFilter =
    !!params.get("q") ||
    !!params.get("from") ||
    !!params.get("to") ||
    activeStatuses.length > 0;

  return (
    <div
      className={`mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${pending ? "opacity-60" : ""}`}
    >
      {showSearch && (
        <input
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder={searchPlaceholder ?? tr("filter.search", locale) + "..."}
          onChange={(e) => {
            const v = e.target.value;
            // debounce: wait 250ms before pushing
            window.clearTimeout((window as unknown as { __sf?: number }).__sf);
            (window as unknown as { __sf?: number }).__sf = window.setTimeout(
              () => setParam("q", v.trim() || null),
              250,
            );
          }}
          className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base focus:border-strow-ink focus:outline-none sm:w-56 sm:text-sm"
        />
      )}

      {showDates && (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="date"
            defaultValue={params.get("from") ?? ""}
            onChange={(e) => setParam("from", e.target.value || null)}
            className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base focus:border-strow-ink focus:outline-none sm:w-40 sm:flex-none sm:text-sm"
          />
          <span className="text-xs text-neutral-400">{tr("filter.between", locale)}</span>
          <input
            type="date"
            defaultValue={params.get("to") ?? ""}
            onChange={(e) => setParam("to", e.target.value || null)}
            className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base focus:border-strow-ink focus:outline-none sm:w-40 sm:flex-none sm:text-sm"
          />
        </div>
      )}

      {showStatus && (
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {STATUS_OPTIONS.map((opt) => {
            const active = activeStatuses.includes(opt.v);
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => toggleStatus(opt.v)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? opt.cls + " ring-2 ring-offset-1 ring-neutral-300"
                    : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                }`}
              >
                {tr(opt.key, locale)}
              </button>
            );
          })}
        </div>
      )}

      {hasAnyFilter && (
        <button
          type="button"
          onClick={() => {
            startTransition(() => router.push(pathname as never));
          }}
          className="self-start text-xs text-neutral-500 underline hover:text-strow-ink sm:ms-auto"
        >
          {tr("filter.clear", locale)}
        </button>
      )}
    </div>
  );
}

