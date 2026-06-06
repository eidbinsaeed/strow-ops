import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LineRow = {
  quantity: number;
  unit_price: number;
  line_total: number;
  description: string;
  inventory_item_id: string | null;
  inventory_items: { name: string; kind: string | null; unit: string | null } | null;
  expenses: { expense_date: string; suppliers: { name: string } | null } | null;
};

type Line = {
  qty: number;
  price: number;
  total: number;
  desc: string;
  date: string;
  supplier: string;
  flags: string[];
};

type Item = {
  name: string;
  kind: string;
  unit: string;
  lines: Line[];
  buys: number;
  totalQty: number;
  totalSpend: number;
  avgPrice: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
  suppliers: SupplierStat[];
  firstBuy: string;
  lastBuy: string;
  intervalDays: number | null;
  flagCount: number;
};

type SupplierStat = {
  name: string;
  buys: number;
  qty: number;
  spend: number;
  avgPrice: number;
};

const KIND_LABEL: Record<string, string> = {
  dairy: "Dairy",
  plant_milk: "Plant milk",
  coffee: "Coffee",
  bakery: "Bakery",
  base: "Bases & purees",
  produce: "Produce",
  frozen_fruit: "Frozen fruit",
  pantry: "Pantry",
  beverage: "Beverages",
  packaging: "Packaging",
  cleaning: "Cleaning & hygiene",
  service: "Services",
  other: "Other",
};

const KIND_ORDER = [
  "dairy", "plant_milk", "coffee", "base", "bakery", "produce",
  "frozen_fruit", "beverage", "pantry", "packaging", "cleaning", "service", "other",
];

function aed(n: number) {
  return `AED ${Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: string) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function median(xs: number[]) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Per-line anomaly detection. VAT-aware so VAT-inclusive totals are not flagged.
function detectFlags(line: { qty: number; price: number; total: number; date: string }, med: number, n: number): string[] {
  const flags: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  if (line.date < "2025-01-01" || line.date > today) flags.push("Date looks wrong");
  else if (n >= 3 && med > 0 && (line.price < 0.5 * med || line.price > 2 * med)) flags.push("Price outlier");
  const calc = line.qty * line.price;
  if (calc > 0 && line.total > 0) {
    const ratio = line.total / calc;
    if (ratio < 0.98 || ratio > 1.07) flags.push("Qty / total mismatch");
  }
  return flags;
}

export default async function OwnerItemsPage() {
  const locale = await getLocale();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("expense_line_items")
    .select(
      "quantity, unit_price, line_total, description, inventory_item_id, inventory_items(name, kind, unit), expenses(expense_date, suppliers(name))",
    )
    .limit(2000);

  const rows = (data ?? []) as unknown as LineRow[];

  // Split mapped vs unmapped
  const byItem = new Map<string, Item>();
  const unmapped: Line[] = [];

  for (const r of rows) {
    const date = r.expenses?.expense_date ?? "";
    const supplier = r.expenses?.suppliers?.name ?? "Unknown";
    const line: Line = {
      qty: Number(r.quantity) || 0,
      price: Number(r.unit_price) || 0,
      total: Number(r.line_total) || 0,
      desc: r.description,
      date,
      supplier,
      flags: [],
    };
    if (!r.inventory_item_id || !r.inventory_items) {
      unmapped.push(line);
      continue;
    }
    const key = r.inventory_items.name;
    let it = byItem.get(key);
    if (!it) {
      it = {
        name: key,
        kind: r.inventory_items.kind ?? "other",
        unit: r.inventory_items.unit ?? "",
        lines: [],
        buys: 0, totalQty: 0, totalSpend: 0, avgPrice: 0, medianPrice: 0,
        minPrice: 0, maxPrice: 0, suppliers: [], firstBuy: "", lastBuy: "",
        intervalDays: null, flagCount: 0,
      };
      byItem.set(key, it);
    }
    it.lines.push(line);
  }

  // Compute stats per item
  const items: Item[] = [];
  for (const it of byItem.values()) {
    const prices = it.lines.map((l) => l.price);
    const med = median(prices);
    it.medianPrice = med;
    it.buys = it.lines.length;
    it.totalQty = it.lines.reduce((s, l) => s + l.qty, 0);
    it.totalSpend = it.lines.reduce((s, l) => s + l.total, 0);
    it.avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
    it.minPrice = Math.min(...prices);
    it.maxPrice = Math.max(...prices);

    const dates = it.lines.map((l) => l.date).filter(Boolean).sort();
    it.firstBuy = dates[0] ?? "";
    it.lastBuy = dates[dates.length - 1] ?? "";
    if (dates.length >= 2) {
      const span = (new Date(it.lastBuy).getTime() - new Date(it.firstBuy).getTime()) / 86400000;
      it.intervalDays = span > 0 ? Math.round(span / (dates.length - 1)) : null;
    }

    // flags
    for (const l of it.lines) {
      l.flags = detectFlags(l, med, it.lines.length);
      if (l.flags.length) it.flagCount += 1;
    }

    // supplier breakdown
    const sup = new Map<string, SupplierStat>();
    for (const l of it.lines) {
      let s = sup.get(l.supplier);
      if (!s) { s = { name: l.supplier, buys: 0, qty: 0, spend: 0, avgPrice: 0 }; sup.set(l.supplier, s); }
      s.buys += 1; s.qty += l.qty; s.spend += l.total;
    }
    it.suppliers = [...sup.values()].map((s) => ({
      ...s,
      avgPrice: s.qty > 0 ? s.spend / s.qty : 0,
    })).sort((a, b) => b.spend - a.spend);

    items.push(it);
  }

  items.sort((a, b) => b.totalSpend - a.totalSpend);

  const grandSpend = items.reduce((s, i) => s + i.totalSpend, 0)
    + unmapped.reduce((s, l) => s + l.total, 0);
  const flaggedItems = items.filter((i) => i.flagCount > 0);
  const totalFlags = items.reduce((s, i) => s + i.flagCount, 0);

  // group by kind for display
  const groups = KIND_ORDER
    .map((k) => ({ kind: k, items: items.filter((i) => i.kind === k) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">{tr("page.items", locale)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {items.length} {tr("items.tracked", locale)} - {aed(grandSpend)} {tr("items.total_spend", locale)}
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load items: {error.message}
        </div>
      )}

      {/* Review panel */}
      {(flaggedItems.length > 0 || unmapped.length > 0) && (
        <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-800">
            {tr("items.review", locale)}
          </h2>
          {totalFlags > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                {totalFlags} {tr("items.suspicious_lines", locale)}
              </p>
              <ul className="mt-1 space-y-1">
                {items.flatMap((it) =>
                  it.lines
                    .filter((l) => l.flags.length)
                    .map((l, idx) => (
                      <li key={it.name + idx} className="text-xs text-amber-900">
                        <span className="font-medium">{it.name}</span> - {fmtDate(l.date)} - {l.qty} × {aed(l.price)} = {aed(l.total)} - {l.supplier}
                        {" "}
                        {l.flags.map((f) => (
                          <span key={f} className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">{f}</span>
                        ))}
                      </li>
                    )),
                )}
              </ul>
            </div>
          )}
          {unmapped.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                {unmapped.length} {tr("items.unmapped_lines", locale)}
              </p>
              <p className="mt-1 text-[11px] text-amber-700">{tr("items.unmapped_note", locale)}</p>
              <ul className="mt-1 space-y-1">
                {unmapped.map((l, idx) => (
                  <li key={idx} className="text-xs text-amber-900">
                    <span className="italic">{l.desc}</span> - {fmtDate(l.date)} - {aed(l.total)} - {l.supplier}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Item groups */}
      {groups.map((g) => (
        <section key={g.kind} className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            {KIND_LABEL[g.kind] ?? g.kind}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {g.items.map((it) => (
              <div key={it.name} className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-medium">{it.name}</p>
                    <p className="text-xs text-neutral-400">{it.unit}</p>
                  </div>
                  {it.flagCount > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      {it.flagCount} {tr("items.flag", locale)}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label={tr("items.qty", locale)} value={`${it.totalQty}`} />
                  <Stat label={tr("items.spend", locale)} value={aed(it.totalSpend)} />
                  <Stat label={tr("items.typical_price", locale)} value={aed(it.medianPrice)} />
                </div>

                <p className="mt-3 text-xs text-neutral-500">
                  {it.buys} {tr("items.buys", locale)}
                  {it.intervalDays ? ` - ${tr("items.every", locale)} ~${it.intervalDays} ${tr("items.days", locale)}` : ""}
                  {` - ${tr("items.last", locale)} ${fmtDate(it.lastBuy)}`}
                  {it.minPrice !== it.maxPrice ? ` - ${tr("items.range", locale)} ${aed(it.minPrice)}–${aed(it.maxPrice)}` : ""}
                </p>

                {/* supplier breakdown */}
                <div className="mt-3 border-t border-neutral-100 pt-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                    {it.suppliers.length} {it.suppliers.length === 1 ? tr("items.supplier", locale) : tr("items.suppliers", locale)} - {tr("items.price_each", locale)}
                  </p>
                  <div className="space-y-0.5">
                    {it.suppliers.map((s) => (
                      <div key={s.name} className="flex justify-between text-xs text-neutral-600">
                        <span>{s.name}</span>
                        <span className="tabular-nums">
                          {aed(s.avgPrice)} <span className="text-neutral-400">× {s.qty} = {aed(s.spend)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">
          {tr("common.dashboard", locale)}
        </Link>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
