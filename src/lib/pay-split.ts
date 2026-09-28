/** How a day's sales were paid, for display: the app split when it exists, else one "online" figure. */
export type PayRow = {
  cash_total: number | string | null;
  card_total: number | string | null;
  online_total: number | string | null;
  talabat_total?: number | string | null;
  keeta_total?: number | string | null;
  beanz_total?: number | string | null;
};
export function payParts(r: PayRow): { k: "cash" | "card" | "online" | "talabat" | "keeta" | "beanz" | "other"; v: number }[] {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const split = r.talabat_total != null || r.keeta_total != null || r.beanz_total != null;
  const parts: { k: "cash" | "card" | "online" | "talabat" | "keeta" | "beanz" | "other"; v: number }[] = [
    { k: "cash", v: n(r.cash_total) },
    { k: "card", v: n(r.card_total) },
  ];
  if (!split) return [...parts, { k: "online", v: n(r.online_total) }];
  parts.push({ k: "talabat", v: n(r.talabat_total) }, { k: "keeta", v: n(r.keeta_total) }, { k: "beanz", v: n(r.beanz_total) });
  const other = n(r.online_total) - n(r.talabat_total) - n(r.keeta_total) - n(r.beanz_total);
  if (other > 0.004) parts.push({ k: "other", v: Math.round(other * 100) / 100 });
  return parts;
}

/** " (8)" — how many orders a payment method had that day, when the POS counts are known. */
export function ordersFor(by: Record<string, number> | null | undefined, k: string): string {
  if (!by) return "";
  const n = k === "online" ? ["talabat", "keeta", "beanz", "other"].reduce((a, x) => a + (Number(by[x]) || 0), 0) : by[k];
  return n == null ? "" : ` (${n})`;
}
