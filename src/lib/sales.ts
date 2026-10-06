/**
 * Sales data for the Sales, Orders and Recipes pages.
 *
 * A day's sales come from the barista's closing (any status except rejected, like Pulse).
 * A day with no closing yet but a POS report counts the POS total and is marked "POS only".
 * Hours, orders and items only exist on days with a POS report (they start 6 Oct 2026; older
 * days can be uploaded on /owner/pos-reports).
 */
import { createServiceClient } from "@/lib/supabase/server";

type Db = ReturnType<typeof createServiceClient>;
type Page<T> = { data: T[] | null; error: { message: string } | null };

export const N = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Every row, 1,000 at a time (the API returns at most 1,000 per request). */
export async function pageAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>, max = 50_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export const aed0 = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;
export const aed2 = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num0 = (n: number) => Math.round(n).toLocaleString("en-US");

const EMOJI: [number, number][] = [
  [0x1f000, 0x1faff],
  [0x2600, 0x27bf],
  [0x2b00, 0x2bff],
  [0xfe0f, 0xfe0f],
  [0x200d, 0x200d],
  [0x20e3, 0x20e3],
];
/** POS product text without emoji and extra spaces (same rule as public.pos_clean_name). */
export function cleanName(s: string | null | undefined): string {
  return Array.from(s ?? "")
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return !EMOJI.some(([a, b]) => c >= a && c <= b);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
/** "Croissant" + "Cheese " → "Croissant (Cheese)" */
export function productName(product: string, variant: string | null | undefined): string {
  const v = cleanName(variant);
  return v ? `${cleanName(product)} (${v})` : cleanName(product);
}
/** Name key used to match POS names (same rule as public.pos_norm). */
export function normKey(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Clock time in Dubai (UTC+4, no daylight saving) from a timestamp. */
export function dubaiClock(ts: string | null | undefined): { hour: number; minute: number } | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const mins = (d.getUTCHours() * 60 + d.getUTCMinutes() + 240) % 1440;
  return { hour: Math.floor(mins / 60), minute: mins % 60 };
}
export function clockLabel(c: { hour: number; minute: number } | null, ar: boolean): string {
  if (!c) return "—";
  const h12 = c.hour % 12 === 0 ? 12 : c.hour % 12;
  const am = c.hour < 12;
  return `${h12}:${String(c.minute).padStart(2, "0")} ${ar ? (am ? "ص" : "م") : am ? "am" : "pm"}`;
}
export function hourLabel(h: number, ar: boolean): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ar ? (h < 12 ? "ص" : "م") : h < 12 ? "am" : "pm"}`;
}

// ─── Days ────────────────────────────────────────────────────────────────────

export type PosDay = {
  date: string;
  generatedAt: string;
  total: number;
  orders: number;
  cash: number;
  card: number;
  talabat: number;
  keeta: number;
  beanz: number;
  other: number;
  discount: number;
  net: number;
  source: string;
  check: { state: string | null; diff: number | null; closingTotal: number | null };
};

export type SalesDay = {
  date: string;
  total: number;
  cash: number;
  card: number;
  talabat: number;
  keeta: number;
  beanz: number;
  /** Closings before the POS listed each app: one "online" amount. */
  appsUnsplit: number;
  /** POS payment methods that are none of the above. */
  other: number;
  orders: number | null;
  /** "closing" = the barista's count; "pos" = no closing yet, the POS report counts. */
  source: "closing" | "pos";
  /** The closing is still waiting for approval. */
  waiting: boolean;
  pos: PosDay | null;
};

type ClosingRow = {
  closing_date: string;
  grand_total: number | string | null;
  cash_total: number | string | null;
  card_total: number | string | null;
  online_total: number | string | null;
  talabat_total: number | string | null;
  keeta_total: number | string | null;
  beanz_total: number | string | null;
  transactions: number | null;
  status: string;
  created_at: string;
};

type PosRow = {
  business_date: string;
  generated_at: string;
  total_paid: number | string;
  orders_paid: number;
  cash_total: number | string;
  card_total: number | string;
  talabat_total: number | string;
  keeta_total: number | string;
  beanz_total: number | string;
  other_total: number | string;
  discount_total: number | string;
  net_sales: number | string;
  source: string;
  closing_check: { state?: string; diff?: number | string; closing_total?: number | string } | null;
};

const STATUS_RANK: Record<string, number> = { confirmed: 0, pending_review: 1, flagged: 2 };

export function posDayOf(r: PosRow): PosDay {
  const c = r.closing_check ?? null;
  return {
    date: r.business_date,
    generatedAt: r.generated_at,
    total: N(r.total_paid),
    orders: N(r.orders_paid),
    cash: N(r.cash_total),
    card: N(r.card_total),
    talabat: N(r.talabat_total),
    keeta: N(r.keeta_total),
    beanz: N(r.beanz_total),
    other: N(r.other_total),
    discount: N(r.discount_total),
    net: N(r.net_sales),
    source: r.source,
    check: {
      state: c?.state ?? null,
      diff: c?.diff != null ? N(c.diff) : null,
      closingTotal: c?.closing_total != null ? N(c.closing_total) : null,
    },
  };
}

export const POS_DAY_COLUMNS =
  "business_date, generated_at, total_paid, orders_paid, cash_total, card_total, talabat_total, keeta_total, beanz_total, other_total, discount_total, net_sales, source, closing_check";

/** Sales per day from `from` to `to`: closings first, POS reports for days without one. */
export async function loadSalesDays(from: string, to: string, db: Db = createServiceClient()): Promise<Map<string, SalesDay>> {
  const [closings, reports] = await Promise.all([
    pageAll<ClosingRow>((a, b) =>
      db
        .from("closings")
        .select("closing_date, grand_total, cash_total, card_total, online_total, talabat_total, keeta_total, beanz_total, transactions, status, created_at")
        .gte("closing_date", from)
        .lte("closing_date", to)
        .neq("status", "rejected")
        .order("closing_date")
        .order("created_at")
        .range(a, b),
    ),
    pageAll<PosRow>((a, b) => db.from("pos_daily_reports").select(POS_DAY_COLUMNS).gte("business_date", from).lte("business_date", to).order("business_date").range(a, b)),
  ]);

  const best = new Map<string, ClosingRow>();
  for (const c of closings) {
    const cur = best.get(c.closing_date);
    const rank = (x: ClosingRow) => STATUS_RANK[x.status] ?? 3;
    if (!cur || rank(c) < rank(cur) || (rank(c) === rank(cur) && c.created_at > cur.created_at)) best.set(c.closing_date, c);
  }
  const pos = new Map(reports.map((r) => [r.business_date, posDayOf(r)]));

  const out = new Map<string, SalesDay>();
  for (const [date, c] of best) {
    const online = N(c.online_total);
    const t = N(c.talabat_total);
    const k = N(c.keeta_total);
    const b = N(c.beanz_total);
    out.set(date, {
      date,
      total: N(c.grand_total),
      cash: N(c.cash_total),
      card: N(c.card_total),
      talabat: t,
      keeta: k,
      beanz: b,
      appsUnsplit: Math.max(0, online - t - k - b),
      other: 0,
      orders: c.transactions ?? null,
      source: "closing",
      waiting: c.status !== "confirmed",
      pos: pos.get(date) ?? null,
    });
  }
  for (const [date, p] of pos) {
    if (out.has(date)) continue;
    out.set(date, {
      date,
      total: p.total,
      cash: p.cash,
      card: p.card,
      talabat: p.talabat,
      keeta: p.keeta,
      beanz: p.beanz,
      appsUnsplit: 0,
      other: p.other,
      orders: p.orders,
      source: "pos",
      waiting: false,
      pos: p,
    });
  }
  return out;
}

export type Totals = {
  total: number;
  cash: number;
  card: number;
  talabat: number;
  keeta: number;
  beanz: number;
  appsUnsplit: number;
  other: number;
  /** Orders, and the sales of the days that have an order count. */
  orders: number;
  orderSales: number;
  days: number;
  daysWithOrders: number;
  posOnly: number;
  waiting: number;
  best: SalesDay | null;
};

export function totalsOf(days: Iterable<SalesDay>): Totals {
  const t: Totals = { total: 0, cash: 0, card: 0, talabat: 0, keeta: 0, beanz: 0, appsUnsplit: 0, other: 0, orders: 0, orderSales: 0, days: 0, daysWithOrders: 0, posOnly: 0, waiting: 0, best: null };
  for (const d of days) {
    t.days++;
    t.total += d.total;
    t.cash += d.cash;
    t.card += d.card;
    t.talabat += d.talabat;
    t.keeta += d.keeta;
    t.beanz += d.beanz;
    t.appsUnsplit += d.appsUnsplit;
    t.other += d.other;
    if (d.orders != null && d.orders > 0) {
      t.orders += d.orders;
      t.orderSales += d.total;
      t.daysWithOrders++;
    }
    if (d.source === "pos") t.posOnly++;
    if (d.waiting) t.waiting++;
    if (d.source === "closing" && (!t.best || d.total > t.best.total)) t.best = d;
  }
  return t;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type PayKey = "card" | "cash" | "talabat" | "keeta" | "beanz" | "other" | "mixed" | "free";

export type PosOrder = {
  id: string;
  date: string;
  paidAt: string | null;
  number: string | null;
  total: number;
  qty: number;
  discount: number;
  method: PayKey;
  payments: [string, number][];
  items: { name: string; spec: string | null; qty: number }[];
  type: string | null;
};

type OrderRow = {
  order_id: string;
  business_date: string;
  paid_at: string | null;
  take_up_number: string | null;
  total_paid: number | string;
  product_qty: number | string | null;
  order_discount: number | string | null;
  payment_method: string | null;
  payments: unknown;
  items: unknown;
  order_type: string | null;
};

export function payKeyOf(method: string | null, total: number): PayKey {
  if (total <= 0) return "free";
  const m = (method ?? "").toLowerCase();
  if (m === "card" || m === "cash" || m === "talabat" || m === "keeta" || m === "beanz" || m === "mixed") return m;
  if (m === "none") return "free";
  return "other";
}

/** POS orders from `from` to `to`, newest first (at most `limit`). */
export async function loadPosOrders(from: string, to: string, limit = 4000, db: Db = createServiceClient()): Promise<PosOrder[]> {
  const rows = await pageAll<OrderRow>(
    (a, b) =>
      db
        .from("pos_orders")
        .select("order_id, business_date, paid_at, take_up_number, total_paid, product_qty, order_discount, payment_method, payments, items, order_type")
        .gte("business_date", from)
        .lte("business_date", to)
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("order_id")
        .range(a, b),
    limit,
  );
  return rows.map((r) => {
    const total = N(r.total_paid);
    const items = Array.isArray(r.items)
      ? (r.items as { name?: unknown; spec?: unknown; qty?: unknown }[]).map((it) => ({
          name: String(it?.name ?? ""),
          spec: it?.spec == null ? null : String(it.spec),
          qty: N(it?.qty) || 1,
        }))
      : [];
    const payments = Array.isArray(r.payments) ? (r.payments as unknown[]).map((p) => (Array.isArray(p) ? ([String(p[0] ?? ""), N(p[1])] as [string, number]) : (["", 0] as [string, number]))) : [];
    return {
      id: r.order_id,
      date: r.business_date,
      paidAt: r.paid_at,
      number: r.take_up_number,
      total,
      qty: r.product_qty != null ? N(r.product_qty) : items.reduce((s, it) => s + it.qty, 0),
      discount: Math.abs(N(r.order_discount)),
      method: payKeyOf(r.payment_method, total),
      payments,
      items,
      type: r.order_type,
    };
  });
}

/** "Croissant" + spec "Cheese " → "Croissant (Cheese)"; specs starting with "Default" are left out. */
export function itemLabel(name: string, spec: string | null): string {
  const base = cleanName(name);
  const s = cleanName(spec);
  if (!s || /^default\b/i.test(s)) return base;
  return `${base} (${s.split("/").map((x) => x.trim()).filter(Boolean).join(", ")})`;
}
export function itemsText(items: PosOrder["items"]): string {
  return items.map((it) => `${it.qty > 1 ? `${it.qty}× ` : ""}${itemLabel(it.name, it.spec)}`).join(", ");
}

export const PAY_LABEL: Record<PayKey, { en: string; ar: string }> = {
  card: { en: "Card", ar: "بطاقة" },
  cash: { en: "Cash", ar: "نقد" },
  talabat: { en: "Talabat", ar: "طلبات" },
  keeta: { en: "Keeta", ar: "كيتا" },
  beanz: { en: "Beanz", ar: "Beanz" },
  other: { en: "Other", ar: "أخرى" },
  mixed: { en: "Split", ar: "مقسّم" },
  free: { en: "Free", ar: "مجاني" },
};

/** Sales by hour of the day (Dubai), from POS orders. */
export function byHour(orders: PosOrder[]): { hour: number; total: number; orders: number }[] {
  const m = new Map<number, { total: number; orders: number }>();
  for (const o of orders) {
    const c = dubaiClock(o.paidAt);
    if (!c) continue;
    const cur = m.get(c.hour) ?? { total: 0, orders: 0 };
    cur.total += o.total;
    cur.orders += 1;
    m.set(c.hour, cur);
  }
  if (!m.size) return [];
  const hours = [...m.keys()];
  const lo = Math.min(...hours);
  const hi = Math.max(...hours);
  const out = [];
  for (let h = lo; h <= hi; h++) out.push({ hour: h, total: m.get(h)?.total ?? 0, orders: m.get(h)?.orders ?? 0 });
  return out;
}

/** The busiest run of `span` hours (by sales). */
export function busiest(hours: { hour: number; total: number }[], span = 3): { from: number; to: number; total: number } | null {
  if (!hours.length) return null;
  let best: { from: number; to: number; total: number } | null = null;
  for (let i = 0; i < hours.length; i++) {
    const win = hours.slice(i, i + span);
    const total = win.reduce((s, h) => s + h.total, 0);
    if (!best || total > best.total) best = { from: win[0].hour, to: win[win.length - 1].hour + 1, total };
  }
  return best && best.total > 0 ? best : null;
}

// ─── Items sold ──────────────────────────────────────────────────────────────

export type ProductSale = {
  date: string;
  product: string;
  variant: string | null;
  qty: number;
  gross: number;
  discount: number;
  net: number;
  menuItemId: string | null;
  menuItem: string | null;
  unitCost: number | null;
  recipeCost: number | null;
  costStatus: "costed" | "partly_costed" | "no_recipe";
};

type ProductRow = {
  business_date: string;
  product: string;
  variant: string | null;
  qty: number | string;
  gross: number | string;
  discount: number | string;
  net: number | string;
  menu_item_id: string | null;
  menu_item: string | null;
  unit_cost: number | string | null;
  recipe_cost: number | string | null;
  cost_status: string;
};

export async function loadProductSales(from: string, to: string, db: Db = createServiceClient()): Promise<ProductSale[]> {
  const rows = await pageAll<ProductRow>((a, b) =>
    db
      .from("v_pos_product_sales")
      .select("business_date, product, variant, qty, gross, discount, net, menu_item_id, menu_item, unit_cost, recipe_cost, cost_status")
      .gte("business_date", from)
      .lte("business_date", to)
      .order("business_date")
      .order("id")
      .range(a, b),
  );
  return rows.map((r) => ({
    date: r.business_date,
    product: r.product,
    variant: r.variant,
    qty: N(r.qty),
    gross: N(r.gross),
    discount: N(r.discount),
    net: N(r.net),
    menuItemId: r.menu_item_id,
    menuItem: r.menu_item,
    unitCost: r.unit_cost == null ? null : N(r.unit_cost),
    recipeCost: r.recipe_cost == null ? null : N(r.recipe_cost),
    costStatus: r.cost_status === "costed" || r.cost_status === "partly_costed" ? r.cost_status : "no_recipe",
  }));
}

export type ItemTotal = {
  key: string;
  name: string;
  menuItemId: string | null;
  qty: number;
  gross: number;
  discount: number;
  net: number;
  recipeCost: number | null;
  unitCost: number | null;
  costStatus: ProductSale["costStatus"];
};

/** Items sold, one row per menu item (or per POS product when it has no menu item yet), best sellers first. */
export function itemTotals(sales: ProductSale[]): ItemTotal[] {
  const m = new Map<string, ItemTotal>();
  for (const s of sales) {
    const key = s.menuItemId ?? `pos:${normKey(`${s.product} ${s.variant ?? ""}`)}`;
    const cur =
      m.get(key) ??
      ({
        key,
        name: s.menuItem ?? productName(s.product, s.variant),
        menuItemId: s.menuItemId,
        qty: 0,
        gross: 0,
        discount: 0,
        net: 0,
        recipeCost: null,
        unitCost: s.unitCost,
        costStatus: s.costStatus,
      } as ItemTotal);
    cur.qty += s.qty;
    cur.gross += s.gross;
    cur.discount += s.discount;
    cur.net += s.net;
    if (s.recipeCost != null) cur.recipeCost = (cur.recipeCost ?? 0) + s.recipeCost;
    if (s.unitCost != null) cur.unitCost = s.unitCost;
    if (s.costStatus === "partly_costed") cur.costStatus = "partly_costed";
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.net - a.net || b.qty - a.qty || a.name.localeCompare(b.name));
}

// ─── Small queries ───────────────────────────────────────────────────────────

/** First day with sales (closing or POS report) — the period arrows stop there. */
export async function firstSalesDay(db: Db = createServiceClient()): Promise<string | null> {
  const [c, p] = await Promise.all([
    db.from("closings").select("closing_date").neq("status", "rejected").order("closing_date").limit(1),
    db.from("pos_daily_reports").select("business_date").order("business_date").limit(1),
  ]);
  const a = (c.data?.[0] as { closing_date?: string } | undefined)?.closing_date ?? null;
  const b = (p.data?.[0] as { business_date?: string } | undefined)?.business_date ?? null;
  return a && b ? (a < b ? a : b) : (a ?? b);
}

/** Business dates that have a POS report (first and latest). */
export async function posRange(db: Db = createServiceClient()): Promise<{ first: string | null; last: string | null }> {
  const [a, b] = await Promise.all([
    db.from("pos_daily_reports").select("business_date").order("business_date").limit(1),
    db.from("pos_daily_reports").select("business_date").order("business_date", { ascending: false }).limit(1),
  ]);
  return {
    first: (a.data?.[0] as { business_date?: string } | undefined)?.business_date ?? null,
    last: (b.data?.[0] as { business_date?: string } | undefined)?.business_date ?? null,
  };
}

export async function vatRate(db: Db = createServiceClient()): Promise<number> {
  const { data } = await db.from("locations").select("vat_rate").eq("slug", "qave_main").maybeSingle();
  const r = Number((data as { vat_rate?: unknown } | null)?.vat_rate);
  return Number.isFinite(r) && r >= 0 && r < 1 ? r : 0.05;
}
