"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

type Props = {
  /** Show status pills filter */
  showStatus?: boolean;
  /** Show search box */
  showSearch?: boolean;
  /** Placeholder for search input */
  searchPlaceholder?: string;
  /** Show date range filter */
  showDates?: boolean;
};

const STATUS_OPTIONS = [
  { v: "confirmed", label: "Confirmed", cls: "bg-emerald-50 text-emerald-700" },
  { v: "pending_review", label: "Pending", cls: "bg-amber-50 text-amber-700" },
  { v: "flagged", label: "Flagged", cls: "bg-red-50 text-red-700" },
  { v: "rejected", label: "Rejected", cls: "bg-neutral-100 text-neutral-500" },
] as const;

export function TableFilters({
  showStatus = true,
  showSearch = true,
  searchPlaceholder = "Search...",
  showDates = true,
}: Props) {
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
      className={`mb-4 flex flex-wrap items-center gap-2 ${pending ? "opacity-60" : ""}`}
    >
      {showSearch && (
        <input
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder={searchPlaceholder}
          onChange={(e) => {
            const v = e.target.value;
            // debounce: wait 250ms before pushing
            window.clearTimeout((window as unknown as { __sf?: number }).__sf);
            (window as unknown as { __sf?: number }).__sf = window.setTimeout(
              () => setParam("q", v.trim() || null),
              250,
            );
          }}
          className="w-48 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-strow-ink focus:outline-none"
        />
      )}

      {showDates && (
        <>
          <input
            type="date"
            defaultValue={params.get("from") ?? ""}
            onChange={(e) => setParam("from", e.target.value || null)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-strow-ink focus:outline-none"
          />
          <span className="text-xs text-neutral-400">to</span>
          <input
            type="date"
            defaultValue={params.get("to") ?? ""}
            onChange={(e) => setParam("to", e.target.value || null)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-strow-ink focus:outline-none"
          />
        </>
      )}

      {showStatus && (
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_OPTIONS.map((opt) => {
            const active = activeStatuses.includes(opt.v);
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => toggleStatus(opt.v)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  active
                    ? opt.cls + " ring-2 ring-offset-1 ring-neutral-300"
                    : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                }`}
              >
                {opt.label}
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
          className="ml-auto text-xs text-neutral-500 underline hover:text-strow-ink"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

/**
 * Reads filter params from URL on the server. Use in server components.
 */
export type FilterParams = {
  q: string | null;
  from: string | null;
  to: string | null;
  statuses: string[];
};

export function parseFilters(
  searchParams: Record<string, string | undefined>,
): FilterParams {
  const q = searchParams.q?.trim() || null;
  const from = searchParams.from?.trim() || null;
  const to = searchParams.to?.trim() || null;
  const statuses =
    searchParams.status
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return { q, from, to, statuses };
}
