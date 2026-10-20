/**
 * VAT return for a period (normally a calendar quarter): what goes on the FTA
 * VAT 201 form, sales by month and day, and every bill with the checks that
 * decide whether its VAT can be claimed.
 *
 * Sales: every closing that isn't rejected; prices include VAT, so
 *   VAT = total × rate ÷ (1 + rate). Al Ain is in Abu Dhabi → Box 1a.
 * Purchases (Box 9): a bill's VAT counts as recoverable only when the
 *   supplier's TRN is on file and the bill is not a proforma. Bills with VAT
 *   but no TRN (or a proforma) are listed under "Check before you file".
 * Due date: 28 days after the period ends.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { fetchVatRate } from "@/lib/reports/pnl";

type Num = number | string | null;
const N = (v: Num | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type Quarter = { key: string; from: string; to: string; label: string; short: string; done: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

export function quarterOf(y: number, q: number, today: string): Quarter {
  const m0 = (q - 1) * 3;
  const from = `${y}-${pad(m0 + 1)}-01`;
  const to = `${y}-${pad(m0 + 3)}-${pad(lastDay(y, m0 + 2))}`;
  return {
    key: `${y}-q${q}`,
    from,
    to,
    label: `${MONTHS[m0]} – ${MONTHS[m0 + 2]} ${y}`,
    short: `${MONTHS[m0].slice(0, 3)}–${MONTHS[m0 + 2].slice(0, 3)}`,
    done: to < today,
  };
}

/** Quarters from the first record (May 2026) to now, newest first. */
export function quartersSince(first: string, today: string): Quarter[] {
  const out: Quarter[] = [];
  let y = Number(today.slice(0, 4));
  let q = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
  for (let k = 0; k < 12; k++) {
    const qq = quarterOf(y, q, today);
    if (qq.to < first) break;
    out.push(qq);
    q--;
    if (q === 0) {
      q = 4;
      y--;
    }
  }
  return out;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type VatSalesDay = { date: string; cash: number; card: number; apps: number; total: number; base: number; vat: number; status: string };
export type VatBill = {
  id: string;
  date: string;
  supplier: string | null;
  trn: string | null;
  invoice: string | null;
  category: string | null;
  docType: string | null;
  status: string;
  subtotal: number;
  vat: number;
  total: number;
  payment: string | null;
  photoId: string | null;
  claim: boolean; // VAT counted in Box 9
  checks: ("no_trn" | "proforma" | "no_photo" | "not_approved")[];
};
export type VatMonth = { key: string; label: string; days: number; closed: number; total: number; base: number; vat: number; bills: number; billBase: number; billVat: number; claimVat: number };

export type VatReturn = {
  from: string;
  to: string;
  rate: number;
  due: string;
  daysToDue: number;
  sales: { total: number; base: number; vat: number; days: VatSalesDay[]; missing: string[]; unconfirmed: number };
  purchases: { bills: VatBill[]; total: number; base: number; vat: number; claimBase: number; claimVat: number; checkVat: number };
  months: VatMonth[];
  boxes: { b1aAmount: number; b1aVat: number; b9Amount: number; b9Vat: number; b12: number; b13: number; b14: number };
  checks: { noTrn: VatBill[]; proforma: VatBill[]; noPhoto: VatBill[]; notApproved: VatBill[] };
};

const TRN = /^\d{15}$/;

function driveId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(url) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(url);
  return m ? m[1] : null;
}

export type VatInput = {
  rate: number;
  closings: Record<string, Num>[];
  bills: RawBill[];
  /** The first closing Strow has (days before it are not "missing"). */
  first: string | null;
  from: string;
  to: string;
  today: string;
};
type RawBill = {
  id: string;
  expense_date: string;
  status: string;
  invoice_number: string | null;
  doc_type: string | null;
  subtotal: Num;
  vat_amount: Num;
  total: Num;
  payment_method: string | null;
  photo_drive_url: string | null;
  suppliers: { name: string; trn: string | null } | { name: string; trn: string | null }[] | null;
  categories: { name: string } | { name: string }[] | null;
};

export async function loadVatReturn(from: string, to: string, today: string): Promise<VatReturn> {
  const db = createServiceClient();
  const [rate, closRes, billRes, firstRes] = await Promise.all([
    fetchVatRate(),
    db
      .from("closings")
      .select("closing_date, status, grand_total, cash_total, card_total, online_total, talabat_total, keeta_total, beanz_total")
      .neq("status", "rejected")
      .gte("closing_date", from)
      .lte("closing_date", to)
      .order("closing_date")
      .range(0, 1999),
    db
      .from("expenses")
      .select("id, expense_date, status, invoice_number, doc_type, subtotal, vat_amount, total, payment_method, photo_drive_url, suppliers(name, trn), categories(name)")
      .neq("status", "rejected")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date")
      .order("created_at")
      .range(0, 4999),
    db.from("closings").select("closing_date").neq("status", "rejected").order("closing_date").limit(1),
  ]);
  if (closRes.error) throw new Error(closRes.error.message);
  if (billRes.error) throw new Error(billRes.error.message);
  return buildVatReturn({
    rate,
    closings: (closRes.data ?? []) as Record<string, Num>[],
    bills: (billRes.data ?? []) as unknown as RawBill[],
    first: ((firstRes.data ?? [])[0] as { closing_date?: string } | undefined)?.closing_date ?? null,
    from,
    to,
    today,
  });
}

/** The maths, without the database (so it can be checked on its own). */
export function buildVatReturn({ rate, closings, bills: rawBills, first: firstClose, from, to, today }: VatInput): VatReturn {
  const k = rate / (1 + rate);

  // ---- Sales, one row per day
  const byDay = new Map<string, VatSalesDay>();
  let unconfirmed = 0;
  for (const c of closings) {
    const date = String(c.closing_date);
    const split = c.talabat_total != null || c.keeta_total != null || c.beanz_total != null;
    const d = byDay.get(date) ?? { date, cash: 0, card: 0, apps: 0, total: 0, base: 0, vat: 0, status: String(c.status) };
    d.cash += N(c.cash_total);
    d.card += N(c.card_total);
    d.apps += split ? N(c.talabat_total) + N(c.keeta_total) + N(c.beanz_total) : N(c.online_total);
    d.total += N(c.grand_total);
    if (c.status !== "confirmed") {
      d.status = String(c.status);
      unconfirmed++;
    }
    byDay.set(date, d);
  }
  const days = [...byDay.values()].map((d) => ({ ...d, vat: r2(d.total * k), base: r2(d.total - d.total * k) }));
  const salesTotal = days.reduce((a, d) => a + d.total, 0);
  const salesVat = r2(salesTotal * k);
  // A day is missing only after Strow's first closing (before that there was nothing to record).
  const first = firstClose ?? from;
  const lastCounted = to < today ? to : addDays(today, -1);
  const missing: string[] = [];
  for (let d = from > first ? from : first; d <= lastCounted; d = addDays(d, 1)) if (!byDay.has(d)) missing.push(d);

  // ---- Bills
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const bills: VatBill[] = rawBills.map((b) => {
    const s = one(b.suppliers);
    const trn = s?.trn?.replace(/\s+/g, "") || null;
    const vat = N(b.vat_amount);
    const proforma = (b.doc_type ?? "").toLowerCase() === "proforma";
    const photoId = driveId(b.photo_drive_url);
    const checks: VatBill["checks"] = [];
    if (vat > 0 && !(trn && TRN.test(trn))) checks.push("no_trn");
    if (vat > 0 && proforma) checks.push("proforma");
    if (!photoId) checks.push("no_photo");
    if (b.status !== "confirmed") checks.push("not_approved");
    return {
      id: b.id,
      date: b.expense_date,
      supplier: s?.name ?? null,
      trn,
      invoice: b.invoice_number?.trim() || null,
      category: one(b.categories)?.name ?? null,
      docType: b.doc_type,
      status: b.status,
      subtotal: N(b.subtotal),
      vat,
      total: N(b.total),
      payment: b.payment_method,
      photoId,
      claim: vat > 0 && !checks.includes("no_trn") && !checks.includes("proforma"),
      checks,
    };
  });
  const claimBills = bills.filter((b) => b.claim);
  const claimVat = r2(claimBills.reduce((a, b) => a + b.vat, 0));
  const claimBase = r2(claimBills.reduce((a, b) => a + b.subtotal, 0));

  // ---- Months
  const months: VatMonth[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); ) {
    const y = Number(m.slice(0, 4));
    const m0 = Number(m.slice(5, 7)) - 1;
    const inM = days.filter((d) => d.date.startsWith(m));
    const bM = bills.filter((b) => b.date.startsWith(m));
    const mFrom = m === from.slice(0, 7) ? from : `${m}-01`;
    const mTo = m === to.slice(0, 7) ? to : `${m}-${pad(lastDay(y, m0))}`;
    const span = Math.max(0, Math.round((Date.parse(`${mTo < lastCounted ? mTo : lastCounted}T00:00:00Z`) - Date.parse(`${mFrom}T00:00:00Z`)) / 86_400_000) + 1);
    const total = inM.reduce((a, d) => a + d.total, 0);
    months.push({
      key: m,
      label: `${MONTHS[m0]} ${y}`,
      days: span,
      closed: inM.length,
      total: r2(total),
      base: r2(total - total * k),
      vat: r2(total * k),
      bills: bM.length,
      billBase: r2(bM.reduce((a, b) => a + b.subtotal, 0)),
      billVat: r2(bM.reduce((a, b) => a + b.vat, 0)),
      claimVat: r2(bM.filter((b) => b.claim).reduce((a, b) => a + b.vat, 0)),
    });
    const next = new Date(Date.UTC(y, m0 + 1, 1));
    m = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`;
  }

  const due = addDays(to, 28);
  return {
    from,
    to,
    rate,
    due,
    daysToDue: Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
    sales: { total: r2(salesTotal), base: r2(salesTotal - salesVat), vat: salesVat, days, missing, unconfirmed },
    purchases: {
      bills,
      total: r2(bills.reduce((a, b) => a + b.total, 0)),
      base: r2(bills.reduce((a, b) => a + b.subtotal, 0)),
      vat: r2(bills.reduce((a, b) => a + b.vat, 0)),
      claimBase,
      claimVat,
      checkVat: r2(bills.filter((b) => b.vat > 0 && !b.claim).reduce((a, b) => a + b.vat, 0)),
    },
    months,
    boxes: {
      b1aAmount: r2(salesTotal - salesVat),
      b1aVat: salesVat,
      b9Amount: claimBase,
      b9Vat: claimVat,
      b12: salesVat,
      b13: claimVat,
      b14: r2(salesVat - claimVat),
    },
    checks: {
      noTrn: bills.filter((b) => b.checks.includes("no_trn")),
      proforma: bills.filter((b) => b.checks.includes("proforma")),
      noPhoto: bills.filter((b) => b.checks.includes("no_photo")),
      notApproved: bills.filter((b) => b.checks.includes("not_approved")),
    },
  };
}
