/**
 * Bill VAT maths — works out on its own whether a bill's line prices
 * include VAT or not, and splits VAT across the lines so every line ends up
 * with a NET amount and its own VAT share.
 *
 * Supplier invoices usually print net line prices + VAT at the bottom
 * (lines add up to the subtotal). Supermarket receipts print VAT-inclusive
 * prices (lines add up to the total). Some bills mix taxed and untaxed
 * lines (a delivery fee with no VAT). Some round the total by a few fils.
 */

export type VatLine = {
  line_total: number;
  vat_amount?: number | null;
  vat_rate?: number | null;
  line_kind?: string | null;
};

export type VatMode = "exclusive" | "inclusive" | "unknown";

export type VatResult<L> = {
  mode: VatMode;
  lines: (L & { line_total: number; vat_amount: number })[];
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  /** Lines (after VAT) + rounding match the bill total. */
  ok: boolean;
  /** Small printed/implied rounding (≤ 0.25) — never a reason to flag. */
  rounding: number;
  message: string;
};

export const ROUNDING_TOLERANCE = 0.25;

const r2 = (n: number) => Math.round(n * 100) / 100;
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

function tolFor(total: number | null) {
  return Math.max(0.05, (total ?? 0) * 0.002);
}

/**
 * @param lines   line_total as printed (net or gross — we find out which)
 * @param subtotal/vat/total  header figures as printed (any may be null)
 */
export function reconcileVat<L extends VatLine>(
  lines: L[],
  head: {
    subtotal: number | null;
    vat: number | null;
    total: number | null;
    rounding?: number | null;
    /** The reader saw "tax inclusive" prices on the bill. */
    pricesIncludeVat?: boolean | null;
  },
): VatResult<L> {
  let { subtotal, vat } = head;
  const total = head.total;
  const printedRounding = head.rounding ?? 0;
  const tol = tolFor(total);

  // Fill a missing header figure from the other two.
  if (total != null && subtotal != null && vat == null) vat = r2(total - subtotal - printedRounding);
  if (total != null && vat != null && subtotal == null) subtotal = r2(total - vat - printedRounding);

  const S = r2(lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0));
  const lineVat = r2(lines.reduce((s, l) => s + (Number(l.vat_amount) || 0), 0));

  const base = (mode: VatMode, out: VatResult<L>["lines"], okTotal: number): VatResult<L> => {
    const diff = total != null ? r2(total - okTotal) : 0;
    const ok = total == null || Math.abs(diff) <= ROUNDING_TOLERANCE;
    return {
      mode,
      lines: out,
      subtotal,
      vat,
      total,
      ok,
      rounding: ok ? diff : 0,
      message:
        mode === "exclusive"
          ? "Prices exclude VAT"
          : mode === "inclusive"
            ? "Prices include VAT"
            : "Couldn't match the lines to the total",
    };
  };

  if (lines.length === 0) {
    const okTotal = (subtotal ?? 0) + (vat ?? 0);
    return base("unknown", [], subtotal != null ? okTotal : total ?? 0);
  }

  // 1) Lines carry their own VAT and net + VAT = total → exclusive, keep as is.
  if (lineVat > 0 && total != null && close(S + lineVat, total, tol + ROUNDING_TOLERANCE)) {
    return base(
      "exclusive",
      lines.map((l) => ({ ...l, line_total: r2(l.line_total), vat_amount: r2(Number(l.vat_amount) || 0) })),
      S + lineVat,
    );
  }

  // A line is taxable unless the bill marks it 0% (e.g. an untaxed delivery fee).
  const taxable = (l: L) => l.vat_rate !== 0;
  const spread = (amount: number, over: L[]) => {
    const pool = over.filter(taxable);
    const denom = pool.reduce((s, l) => s + (Number(l.line_total) || 0), 0);
    let left = r2(amount);
    return over.map((l) => {
      if (!taxable(l) || denom === 0) return 0;
      const isLast = pool[pool.length - 1] === l;
      const share = isLast ? left : r2((amount * (Number(l.line_total) || 0)) / denom);
      left = r2(left - share);
      return share;
    });
  };

  // 2) Lines add up to the subtotal → net prices; spread the VAT.
  if (subtotal != null && close(S, subtotal, tol)) {
    const shares = spread(vat ?? 0, lines);
    return base(
      "exclusive",
      lines.map((l, i) => ({ ...l, line_total: r2(l.line_total), vat_amount: shares[i] })),
      S + (vat ?? 0),
    );
  }

  // 3) Lines add up to the total → VAT-inclusive prices; take the VAT out.
  if (total != null && close(S, total, tol + ROUNDING_TOLERANCE)) {
    // No VAT figure printed: if the bill says prices include VAT, take out
    // the standard 5%; otherwise assume no VAT (never invent tax).
    const v = vat ?? (head.pricesIncludeVat ? r2((S * 5) / 105) : 0);
    const shares = spread(v, lines);
    const out = lines.map((l, i) => ({
      ...l,
      line_total: r2((Number(l.line_total) || 0) - shares[i]),
      vat_amount: shares[i],
    }));
    if (subtotal == null) subtotal = r2(S - v);
    if (vat == null) vat = v;
    return base("inclusive", out, S);
  }

  // 4) No header subtotal/VAT but lines × 1.05 = total → net lines, 5% VAT.
  if (total != null && subtotal == null && close(r2(S * 1.05), total, tol + ROUNDING_TOLERANCE)) {
    vat = r2(total - S);
    subtotal = S;
    const shares = spread(vat, lines);
    return base(
      "exclusive",
      lines.map((l, i) => ({ ...l, line_total: r2(l.line_total), vat_amount: shares[i] })),
      S + vat,
    );
  }

  return base(
    "unknown",
    lines.map((l) => ({ ...l, line_total: r2(l.line_total), vat_amount: r2(Number(l.vat_amount) || 0) })),
    S + lineVat,
  );
}

/** Header check used for status: subtotal + VAT ≈ total, allowing rounding. */
export function headerAddsUp(subtotal: number | null, vat: number | null, total: number): boolean {
  if (subtotal == null || vat == null) return true;
  return Math.abs(subtotal + vat - total) <= ROUNDING_TOLERANCE + 0.01;
}
