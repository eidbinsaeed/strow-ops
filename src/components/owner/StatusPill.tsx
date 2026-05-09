import { tr } from "@/lib/i18n/tr";
import type { Locale } from "@/lib/i18n/dict";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700",
  pending_review: "bg-amber-50 text-amber-700",
  flagged: "bg-red-50 text-red-700",
  rejected: "bg-neutral-100 text-neutral-500",
};

const STATUS_KEYS: Record<string, "status.confirmed" | "status.pending" | "status.flagged" | "status.rejected"> = {
  confirmed: "status.confirmed",
  pending_review: "status.pending",
  flagged: "status.flagged",
  rejected: "status.rejected",
};

export function StatusPill({
  status,
  locale,
}: {
  status: string;
  locale: Locale;
}) {
  const cls = STATUS_STYLES[status] ?? "bg-neutral-100 text-neutral-500";
  const key = STATUS_KEYS[status];
  const label = key ? tr(key, locale) : status.replace("_", " ");
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}
