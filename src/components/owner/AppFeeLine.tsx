import { APP_KEYS, appName, appSalesOfClosing, feesForDay } from "@/lib/app-fees";

const n0 = (n: number) => Math.round(n).toLocaleString("en-US");

/** "Apps 704 → fees −234 → you keep 470 (Talabat −102 · Keeta −35 · Beanz −90)" under a closing. */
export function AppFeeLine({
  row,
  locale,
}: {
  row: { closing_date: string; online_total: unknown; talabat_total?: unknown; keeta_total?: unknown; beanz_total?: unknown };
  locale: string;
}) {
  const ar = locale === "ar";
  const f = feesForDay(row.closing_date, appSalesOfClosing(row));
  if (f.sales.total < 0.5) return null;
  const parts = APP_KEYS.filter((k) => f.sales[k] >= 0.5);
  return (
    <p className="mt-1 text-xs text-neutral-500">
      <span className="tabular-nums">
        {ar ? "التطبيقات" : "Apps"} {n0(f.sales.total)} → {ar ? "رسوم" : "fees"} −{n0(f.fees.total)} →{" "}
        <strong className="font-semibold text-neutral-700">
          {ar ? "يبقى لك" : "you keep"} {n0(f.keep)}
        </strong>
      </span>
      {parts.length > 1 ? (
        <span className="tabular-nums">
          {" "}
          ({parts.map((k) => `${appName(k, ar)} −${n0(f.fees[k])}`).join(" · ")})
        </span>
      ) : null}
    </p>
  );
}
