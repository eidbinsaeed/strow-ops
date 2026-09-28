import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { RowActions } from "@/components/owner/RowActions";
import { ordersFor, payParts } from "@/lib/pay-split";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import { StatusPill as SharedStatusPill } from "@/components/owner/StatusPill";
import { AutoApproveToggles } from "@/components/owner/AutoApproveToggles";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClosingRow = {
  id: string;
  closing_date: string;
  cash_total: number;
  card_total: number;
  online_total: number;
  talabat_total?: number | null;
  keeta_total?: number | null;
  beanz_total?: number | null;
  transactions?: number | null;
  transactions_by_method?: Record<string, number> | null;
  grand_total: number;
  status: string;
  notes: string | null;
  photo_drive_url: string | null;
  baristas: { name: string } | null;
  ai_anomalies: Anomaly | null;
  ai_confidence: Record<string, string> | null;
};

type Anomaly = { has_anomaly?: boolean; flags?: string[]; explanation?: string | null };

const FIELD_NAMES: Record<string, string> = {
  closing_date: "date", cash_total: "cash", card_total: "card", online_total: "online", talabat_total: "Talabat",
  keeta_total: "Keeta", beanz_total: "Beanz", supplier_name: "supplier", expense_date: "date", total: "total", payment_method: "payment method",
};

/** Why an item is waiting: what the AI flagged, or that auto-approve is off. */
function whyText(row: { status: string; ai_anomalies: Anomaly | null; ai_confidence: Record<string, string> | null }): string | null {
  const parts: string[] = [];
  const a = row.ai_anomalies;
  if (a?.has_anomaly) parts.push(a.explanation || (a.flags ?? []).join(", ") || "The AI flagged this one.");
  const unsure = Object.entries(row.ai_confidence ?? {})
    .filter(([k, v]) => v && v !== "high" && FIELD_NAMES[k])
    .map(([k]) => FIELD_NAMES[k]);
  if (unsure.length) parts.push(`AI unsure about: ${[...new Set(unsure)].join(", ")}`);
  if (!parts.length) return row.status === "pending_review" ? "Waiting for your approval (auto-approve is off)." : null;
  return parts.join(" · ");
}

function WhyNote({ row }: { row: { status: string; ai_anomalies: Anomaly | null; ai_confidence: Record<string, string> | null } }) {
  const why = whyText(row);
  if (!why) return null;
  return (
    <p className={`mt-2 rounded-xl px-3 py-2 text-xs leading-snug ${row.status === "flagged" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
      {row.status === "flagged" ? "Flagged: " : ""}
      {why}
    </p>
  );
}

type ExpenseRow = {
  id: string;
  expense_date: string;
  invoice_number: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_method: string;
  status: string;
  notes: string | null;
  photo_drive_url: string | null;
  suppliers: { name: string } | null;
  baristas: { name: string } | null;
  ai_anomalies: Anomaly | null;
  ai_confidence: Record<string, string> | null;
};

function formatAed(n: number) {
  return `AED ${Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-AE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default async function OwnerReviewPage() {
  const locale = await getLocale();
  const supabase = createServiceClient();

  const [closingsResult, expensesResult] = await Promise.all([
    supabase
      .from("closings")
      .select(
        "id, closing_date, cash_total, card_total, online_total, talabat_total, keeta_total, beanz_total, transactions, transactions_by_method, grand_total, status, notes, photo_drive_url, baristas(name), ai_anomalies, ai_confidence",
      )
      .in("status", ["pending_review", "flagged"])
      .order("closing_date", { ascending: false }),
    supabase
      .from("expenses")
      .select(
        "id, expense_date, invoice_number, subtotal, vat_amount, total, payment_method, status, notes, photo_drive_url, suppliers(name), baristas(name), ai_anomalies, ai_confidence",
      )
      .in("status", ["pending_review", "flagged"])
      .order("expense_date", { ascending: false }),
  ]);

  const closings = (closingsResult.data ?? []) as unknown as ClosingRow[];
  const expenses = (expensesResult.data ?? []) as unknown as ExpenseRow[];

  type Item =
    | { kind: "closing"; sortDate: string; row: ClosingRow }
    | { kind: "expense"; sortDate: string; row: ExpenseRow };

  const items: Item[] = [
    ...closings.map(
      (c): Item => ({ kind: "closing", sortDate: c.closing_date, row: c }),
    ),
    ...expenses.map(
      (e): Item => ({ kind: "expense", sortDate: e.expense_date, row: e }),
    ),
  ].sort((a, b) => {
    const fa = a.row.status === "flagged", fb = b.row.status === "flagged";
    if (fa !== fb) return fa ? -1 : 1; // flagged first
    return a.sortDate < b.sortDate ? 1 : -1;
  });
  const settings = await getSettings();

  return (
    <div className="page">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">{tr("page.pending", locale)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {items.length} {items.length === 1 ? "item" : "items"} waiting on
            you
          </p>
        </div>
      </header>

      <AutoApproveToggles closings={settings.autoApproveClosings} bills={settings.autoApproveBills} />

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            {tr("summary.queue_empty", locale)}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) =>
            it.kind === "closing" ? (
              <ClosingCard key={`c-${it.row.id}`} row={it.row} locale={locale} />
            ) : (
              <ExpenseCard key={`e-${it.row.id}`} row={it.row} locale={locale} />
            ),
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">
          {tr("common.dashboard", locale)}
        </Link>
      </p>
    </div>
  );
}


function ClosingCard({ row, locale }: { row: ClosingRow; locale: import("@/lib/i18n/dict").Locale }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wider text-neutral-600">
              {tr("nav.sales", locale)}
            </span>
            <SharedStatusPill status={row.status} locale={locale} />
          </div>
          <p className="mt-2 text-base font-medium">
            {formatDate(row.closing_date)} - {formatAed(row.grand_total)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {payParts(row).map((p) => `${({ cash: tr("card.cash", locale), card: tr("card.card", locale), online: tr("card.online", locale), talabat: "Talabat", keeta: "Keeta", beanz: "Beanz", other: "Other online" } as Record<string, string>)[p.k]} ${formatAed(p.v)}${ordersFor(row.transactions_by_method, p.k)}`).join(" - ")}{row.transactions ? ` - ${row.transactions} orders · avg ${formatAed(Number(row.grand_total) / row.transactions)}` : ""} - {tr("card.by", locale)} {row.baristas?.name ?? "-"}
          </p>
          {row.notes && (
            <p className="mt-2 text-xs italic text-neutral-500">{row.notes}</p>
          )}
          <WhyNote row={row} />
        </div>
      </div>
      <div className="mt-3">
        <RowActions
          type="closing"
          id={row.id}
          status={row.status}
          photoDriveUrl={row.photo_drive_url}
          fields={{
            closing_date: row.closing_date,
            cash_total: Number(row.cash_total),
            card_total: Number(row.card_total),
            online_total: Number(row.online_total),
                    talabat_total: row.talabat_total == null ? null : Number(row.talabat_total),
                    keeta_total: row.keeta_total == null ? null : Number(row.keeta_total),
                    beanz_total: row.beanz_total == null ? null : Number(row.beanz_total),
                    transactions: row.transactions ?? null,
            notes: row.notes,
          }}
        />
      </div>
    </div>
  );
}

function ExpenseCard({ row, locale }: { row: ExpenseRow; locale: import("@/lib/i18n/dict").Locale }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wider text-neutral-600">
              {tr("nav.purchases", locale)}
            </span>
            <SharedStatusPill status={row.status} locale={locale} />
          </div>
          <p className="mt-2 text-base font-medium">
            {formatDate(row.expense_date)} -{" "}
            {row.suppliers?.name ?? tr("card.unknown_vendor", locale)} - {formatAed(row.total)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {tr(("pay." + row.payment_method) as "pay.cash", locale) || row.payment_method}
            {row.invoice_number ? ` - #${row.invoice_number}` : ""}
            {" - " + tr("card.by", locale) + " "}
            {row.baristas?.name ?? "-"}
          </p>
          {row.notes && (
            <p className="mt-2 text-xs italic text-neutral-500">{row.notes}</p>
          )}
          <WhyNote row={row} />
        </div>
      </div>
      <div className="mt-3">
        <RowActions
          type="expense"
          id={row.id}
          status={row.status}
          photoDriveUrl={row.photo_drive_url}
          fields={{
            expense_date: row.expense_date,
            subtotal: Number(row.subtotal),
            vat_amount: Number(row.vat_amount),
            total: Number(row.total),
            payment_method: row.payment_method,
            invoice_number: row.invoice_number,
            notes: row.notes,
          }}
        />
      </div>
    </div>
  );
}
