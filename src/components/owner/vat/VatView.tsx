import Link from "next/link";
import type { Route } from "next";
import { PeriodPicker } from "@/components/owner/PeriodPicker";
import { Reveal } from "@/components/motion/Reveal";
import { CountUpText } from "@/components/ai/CountUp";
import { Group, LargeTitle, Row, Rows } from "@/components/apple/ui";
import { BillsPdf } from "@/components/owner/vat/BillsPdf";
import { PrintRow } from "@/components/owner/vat/PrintRow";
import { COLOR } from "@/lib/sections";
import { MONTHS, type Quarter, type VatBill, type VatReturn } from "@/lib/reports/vat";

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayShort = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;

const CHECK_EN: Record<VatBill["checks"][number], string> = { no_trn: "No TRN", proforma: "Proforma", no_photo: "No photo", not_approved: "Not approved" };
const CHECK_AR: Record<VatBill["checks"][number], string> = { no_trn: "بلا رقم ضريبي", proforma: "فاتورة مبدئية", no_photo: "بلا صورة", not_approved: "غير معتمدة" };

function Line({ label, value, strong = false, sub }: { label: string; value: string; strong?: boolean; sub?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? "font-semibold" : ""}`}>
      <span className="min-w-0">
        {label}
        {sub ? <span className="block text-[13px] font-normal text-neutral-500">{sub}</span> : null}
      </span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

/**
 * VAT return for a quarter (default: the last finished one), laid out like the
 * FTA's VAT 201 form, with what to check before filing and two downloads: an
 * Excel file for the accountant and every bill in one PDF.
 */
export function VatView({ v, ar, label, quarters, picked, custom, from, to }: { v: VatReturn; ar: boolean; label: string; quarters: Quarter[]; picked: Quarter; custom: boolean; from: string; to: string }) {

  const pay = v.boxes.b14;
  const dueSoon = v.daysToDue >= 0 && v.daysToDue <= 10;
  const dueText =
    v.daysToDue < 0
      ? ar
        ? `كان الموعد ${dayShort(v.due)}`
        : `Was due ${dayShort(v.due)}`
      : ar
        ? `آخر موعد ${dayShort(v.due)} · بعد ${v.daysToDue} يوماً`
        : `Due ${dayShort(v.due)} · ${v.daysToDue} day${v.daysToDue === 1 ? "" : "s"} left`;
  const vatOf = (l: VatBill[]) => l.reduce((a, b) => a + b.vat, 0);
  // Biggest VAT first, so the names that matter are the ones you see.
  const names = (l: VatBill[]) => [...new Set([...l].sort((x, y) => y.vat - x.vat).map((b) => b.supplier ?? (ar ? "بلا مورّد" : "no supplier")))].slice(0, 3).join(", ");
  const anyCheck = v.checks.noTrn.length + v.checks.proforma.length + v.checks.noPhoto.length + v.checks.notApproved.length + v.sales.missing.length + v.sales.unconfirmed > 0;
  const file = `qave-bills-${from}-to-${to}.pdf`;

  return (
    <div className="page reveal-js">
      <Reveal className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <div data-reveal="" className="flex flex-col gap-3">
          <LargeTitle title={ar ? "إقرار ضريبة القيمة المضافة" : "VAT return"} subtitle={label} />
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 print:hidden">
            {quarters.map((q) => {
              const on = !custom && q.key === picked.key;
              return (
                <Link
                  key={q.key}
                  href={`/owner/reports/vat?q=${q.key}` as Route}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-[15px] font-semibold ${on ? "bg-strow-ink text-white" : "bg-white text-strow-ink"}`}
                >
                  {q.short} {q.key.slice(0, 4)}
                  {!q.done ? <span className={on ? "text-white/70" : "text-neutral-500"}>{ar ? " · حتى الآن" : " · so far"}</span> : null}
                </Link>
              );
            })}
            <Link
              href={`/owner/reports/vat?from=${from}&to=${to}` as Route}
              className={`shrink-0 rounded-full px-3.5 py-2 text-[15px] font-semibold ${custom ? "bg-strow-ink text-white" : "bg-white text-neutral-500"}`}
            >
              {ar ? "تواريخ أخرى" : "Other dates"}
            </Link>
          </div>
          {custom ? (
            <div className="rounded-2xl bg-white px-4 pt-3 print:hidden">
              <PeriodPicker defaultFrom={from} defaultTo={to} />
            </div>
          ) : null}
        </div>

        {/* What to pay */}
        <section data-reveal="" className="flex flex-col rounded-3xl bg-white px-4 pb-4 pt-4">
          <span className="text-[15px] font-semibold">{pay >= 0 ? (ar ? "الضريبة المستحقة للدفع" : "VAT to pay") : ar ? "ضريبة مستردة" : "VAT to get back"}</span>
          <span className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[20px] font-semibold text-neutral-500">AED</span>
            <span className="text-[44px] font-bold leading-[1.1] tracking-[-1px] tabular-nums">
              <CountUpText text={money(Math.abs(pay))} />
            </span>
          </span>
          <span className={`mt-1.5 inline-flex h-7 items-center self-start rounded-full px-[11px] text-[15px] font-semibold text-white ${dueSoon ? "bg-[#C55300]" : v.daysToDue < 0 ? "bg-[#6C6C70]" : "bg-[#008932]"}`}>{dueText}</span>
          <div className="mt-3 border-t border-[#E5E5EA] pt-2 text-[15px]">
            <Line label={ar ? "ضريبة على المبيعات" : "VAT on sales"} sub={ar ? `${money(v.sales.total)} درهم مبيعات شاملة الضريبة` : `from AED ${money(v.sales.total)} sales incl. VAT`} value={money(v.sales.vat)} />
            <Line
              label={ar ? "ناقص ضريبة الفواتير" : "Less VAT on bills"}
              sub={ar ? `${v.purchases.bills.filter((b) => b.claim).length} فاتورة برقم ضريبي` : `${v.purchases.bills.filter((b) => b.claim).length} bills with a supplier TRN`}
              value={`− ${money(v.purchases.claimVat)}`}
            />
          </div>
        </section>

        {/* Downloads */}
        <Group title={ar ? "للمحاسب" : "For your accountant"} className="print:hidden">
          <div className="apple-rows overflow-hidden rounded-3xl bg-white">
            <a href={`/api/reports/vat/xlsx?from=${from}&to=${to}`} download className="apple-row flex items-center gap-3 ps-4 text-strow-ink active:bg-neutral-100">
              <span aria-hidden className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-[#008932] text-white">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16v16H4z M4 9h16 M4 14h16 M10 4v16" />
                </svg>
              </span>
              <span className="apple-row-body flex min-h-[60px] min-w-0 flex-1 flex-col justify-center py-2 pe-3.5">
                <span className="text-[17px] leading-[22px]">{ar ? "ملف Excel للإقرار" : "Excel file of the return"}</span>
                <span className="text-[15px] leading-5 text-neutral-500">{ar ? "خانات VAT 201 · المبيعات يومياً · كل الفواتير" : "VAT 201 boxes · sales by day · every bill"}</span>
              </span>
            </a>
            <BillsPdf
              ar={ar}
              title={`Qave Cafe — purchase bills, ${label}`}
              fileName={file}
              bills={v.purchases.bills.map((b) => ({ id: b.id, date: b.date, supplier: b.supplier, trn: b.trn, invoice: b.invoice, subtotal: b.subtotal, vat: b.vat, total: b.total, photoId: b.photoId }))}
            />
            <PrintRow ar={ar} />
          </div>
        </Group>

        {/* Checks */}
        {anyCheck ? (
          <Group title={ar ? "راجع قبل التقديم" : "Check before you file"}>
            <Rows>
              {v.checks.noTrn.length ? (
                <Row
                  wrap
                  href="/owner/suppliers"
                  icon="alert"
                  color={COLOR.orange}
                  label={ar ? `${money(vatOf(v.checks.noTrn))} درهم ضريبة غير محسوبة` : `AED ${money(vatOf(v.checks.noTrn))} VAT not counted`}
                  sub={ar ? `${v.checks.noTrn.length} فواتير بلا رقم ضريبي للمورّد: ${names(v.checks.noTrn)}` : `${v.checks.noTrn.length} bills, supplier TRN not on file: ${names(v.checks.noTrn)}`}
                />
              ) : null}
              {v.checks.proforma.length ? (
                <Row
                  wrap
                  href="/owner/expenses"
                  icon="doc"
                  color={COLOR.orange}
                  label={ar ? `${v.checks.proforma.length} فاتورة مبدئية · ${money(vatOf(v.checks.proforma))} درهم` : `${v.checks.proforma.length} proforma · AED ${money(vatOf(v.checks.proforma))} VAT`}
                  sub={ar ? `اطلب الفاتورة الضريبية من ${names(v.checks.proforma)}` : `Ask ${names(v.checks.proforma)} for the tax invoice`}
                />
              ) : null}
              {v.checks.noPhoto.length ? (
                <Row
                  wrap
                  href="/owner/expenses"
                  icon="folder"
                  color={COLOR.grey}
                  label={ar ? `${v.checks.noPhoto.length} فواتير بلا صورة` : `${v.checks.noPhoto.length} bills have no photo`}
                  sub={ar ? "الهيئة تطلب الاحتفاظ بكل فاتورة ضريبية" : "The FTA expects you to keep every tax invoice"}
                />
              ) : null}
              {v.checks.notApproved.length ? (
                <Row wrap href="/owner/review" icon="check" color={COLOR.green} label={ar ? `${v.checks.notApproved.length} فواتير بانتظار موافقتك` : `${v.checks.notApproved.length} bills waiting for your approval`} sub={ar ? "محسوبة هنا، راجعها" : "Counted here — check them"} />
              ) : null}
              {v.sales.missing.length ? (
                <Row
                  wrap
                  href="/close"
                  icon="calendar"
                  color={COLOR.orange}
                  label={ar ? `${v.sales.missing.length} أيام بلا إقفال` : `${v.sales.missing.length} day${v.sales.missing.length === 1 ? "" : "s"} without a closing`}
                  sub={v.sales.missing.slice(0, 5).map(dayShort).join(", ") + (v.sales.missing.length > 5 ? "…" : "")}
                />
              ) : null}
              {v.sales.unconfirmed ? (
                <Row wrap href="/owner/review" icon="check" color={COLOR.green} label={ar ? `${v.sales.unconfirmed} إقفالات غير معتمدة` : `${v.sales.unconfirmed} closings not approved yet`} sub={ar ? "محسوبة في المبيعات" : "Counted in sales"} />
              ) : null}
            </Rows>
          </Group>
        ) : null}

        {/* The form */}
        <Group title={ar ? "في نموذج الهيئة (VAT 201)" : "On the FTA form (VAT 201)"}>
          <div className="overflow-hidden rounded-3xl bg-white px-4 py-2 text-[15px]">
            {[
              { box: "1a", en: "Standard rated supplies in Abu Dhabi", ar: "توريدات خاضعة للنسبة الأساسية — أبوظبي", amount: v.boxes.b1aAmount, vat: v.boxes.b1aVat },
              { box: "9", en: "Standard rated expenses", ar: "نفقات خاضعة للنسبة الأساسية", amount: v.boxes.b9Amount, vat: v.boxes.b9Vat },
              { box: "12", en: "Total value of due tax", ar: "إجمالي الضريبة المستحقة", vat: v.boxes.b12 },
              { box: "13", en: "Total value of recoverable tax", ar: "إجمالي الضريبة القابلة للاسترداد", vat: v.boxes.b13 },
              { box: "14", en: pay >= 0 ? "Payable tax for the period" : "Refundable tax for the period", ar: "صافي الضريبة المستحقة للفترة", vat: Math.abs(pay), strong: true },
            ].map((b) => (
              <div key={b.box} className={`flex items-start gap-3 border-b border-[#E5E5EA] py-2.5 last:border-0 ${b.strong ? "font-semibold" : ""}`}>
                <span className="mt-0.5 flex h-6 min-w-8 shrink-0 items-center justify-center rounded-md bg-[#F2F2F7] px-1.5 text-[13px] font-bold tabular-nums">{b.box}</span>
                <span className="min-w-0 flex-1">
                  {ar ? b.ar : b.en}
                  {b.amount != null ? <span className="block text-[13px] font-normal text-neutral-500">{ar ? `المبلغ ${money(b.amount)}` : `Amount AED ${money(b.amount)}`}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">{money(b.vat)}</span>
              </div>
            ))}
          </div>
          <p className="px-4 pt-2 text-[13px] leading-[18px] text-neutral-500">
            {ar
              ? "لا شيء في Strow للخانات 2–8 و10 (استرداد السياح، المعفاة، الصفرية، الاستيراد، الاحتساب العكسي). الخدمات المدفوعة لجهات خارج الدولة (إعلانات، برامج) قد تحتاج احتساباً عكسياً — اسأل محاسبك. هذا مساعد للتقديم وليس بديلاً عن المحاسب."
              : "Strow has nothing for boxes 2–8 and 10 (tourist refunds, zero-rated or exempt sales, imports, reverse charge). Services billed from abroad (online ads, software) may need reverse charge — ask your accountant. This is an aid for filing, not a substitute for your accountant."}
          </p>
        </Group>

        {/* Months */}
        <Group title={ar ? "شهراً بشهر" : "Month by month"}>
          <div className="overflow-hidden rounded-3xl bg-white text-[15px]">
            {[...v.months, null].map((m) =>
              m ? (
                <div key={m.key} className="border-b border-[#E5E5EA] px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{m.label}</span>
                    <span className={`text-[13px] ${m.closed < m.days ? "font-semibold text-strow-amber" : "text-neutral-500"}`}>
                      {m.closed} {ar ? "من" : "of"} {m.days} {ar ? "يوماً مُقفلة" : "days closed"}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                    <span className="flex justify-between gap-2"><span className="text-neutral-500">{ar ? "المبيعات" : "Sales"}</span>{money(m.total)}</span>
                    <span className="flex justify-between gap-2"><span className="text-neutral-500">{ar ? "ضريبتها" : "VAT"}</span>{money(m.vat)}</span>
                    <span className="flex justify-between gap-2"><span className="text-neutral-500">{ar ? `${m.bills} فاتورة` : `${m.bills} bills`}</span>{money(m.billBase + m.billVat)}</span>
                    <span className="flex justify-between gap-2"><span className="text-neutral-500">{ar ? "محسوبة" : "Counted"}</span>{money(m.claimVat)}</span>
                  </div>
                </div>
              ) : (
                <div key="total" className="bg-[#F9F9FB] px-4 py-3 font-semibold">
                  <span>{ar ? "المجموع" : "Total"}</span>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                    <span className="flex justify-between gap-2"><span className="font-normal text-neutral-500">{ar ? "المبيعات" : "Sales"}</span>{money(v.sales.total)}</span>
                    <span className="flex justify-between gap-2"><span className="font-normal text-neutral-500">{ar ? "ضريبتها" : "VAT"}</span>{money(v.sales.vat)}</span>
                    <span className="flex justify-between gap-2"><span className="font-normal text-neutral-500">{ar ? `${v.purchases.bills.length} فاتورة` : `${v.purchases.bills.length} bills`}</span>{money(v.purchases.total)}</span>
                    <span className="flex justify-between gap-2"><span className="font-normal text-neutral-500">{ar ? "محسوبة" : "Counted"}</span>{money(v.purchases.claimVat)}</span>
                  </div>
                </div>
              ),
            )}
          </div>
          <p className="px-4 pt-2 text-[13px] text-neutral-500">
            {ar ? "المبيعات والفواتير شاملة الضريبة. ضريبة المبيعات = المبيعات × 5 ÷ 105. «محسوبة» = ضريبة الفواتير التي لها رقم ضريبي للمورّد." : `Sales and bills include VAT. VAT on sales = sales × ${Math.round(v.rate * 100)} ÷ ${100 + Math.round(v.rate * 100)}. "Counted" = VAT on bills with a supplier TRN.`}
          </p>
        </Group>

        {/* Every bill */}
        <Group title={ar ? `كل الفواتير (${v.purchases.bills.length})` : `Every bill (${v.purchases.bills.length})`}>
          <details className="group overflow-hidden rounded-3xl bg-white print:hidden">
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-[17px]">
              <span>{ar ? "عرض القائمة" : "Show the list"}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-180" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <ul className="border-t border-[#E5E5EA]">
              {v.purchases.bills.map((b) => (
                <li key={b.id} className="flex items-start gap-3 border-b border-[#F2F2F7] px-4 py-2.5 last:border-0">
                  <span className="w-12 shrink-0 pt-0.5 text-[13px] tabular-nums text-neutral-500">{dayShort(b.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{b.supplier ?? (ar ? "بلا مورّد" : "No supplier")}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-neutral-500">
                      {b.invoice ? <span>#{b.invoice}</span> : null}
                      {b.checks.map((c) => (
                        <span key={c} className={`rounded-full px-1.5 py-px text-[11px] font-semibold ${c === "no_photo" ? "bg-[#F2F2F7] text-neutral-600" : "bg-[#FBEADF] text-[#A84700]"}`}>
                          {(ar ? CHECK_AR : CHECK_EN)[c]}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="shrink-0 text-end tabular-nums">
                    <span className="block text-[15px]">{money(b.total)}</span>
                    <span className={`block text-[13px] ${b.vat > 0 && !b.claim ? "text-strow-amber" : "text-neutral-500"}`}>
                      {ar ? "ض" : "VAT"} {money(b.vat)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
          {/* Printed: the list is always open. */}
          <div className="hidden overflow-hidden rounded-3xl bg-white print:block">
            <ul className="border-t border-[#E5E5EA]">
              {v.purchases.bills.map((b) => (
                <li key={b.id} className="flex items-start gap-3 border-b border-[#F2F2F7] px-4 py-2.5 last:border-0">
                  <span className="w-12 shrink-0 pt-0.5 text-[13px] tabular-nums text-neutral-500">{dayShort(b.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{b.supplier ?? (ar ? "بلا مورّد" : "No supplier")}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-neutral-500">
                      {b.invoice ? <span>#{b.invoice}</span> : null}
                      {b.checks.map((c) => (
                        <span key={c} className={`rounded-full px-1.5 py-px text-[11px] font-semibold ${c === "no_photo" ? "bg-[#F2F2F7] text-neutral-600" : "bg-[#FBEADF] text-[#A84700]"}`}>
                          {(ar ? CHECK_AR : CHECK_EN)[c]}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="shrink-0 text-end tabular-nums">
                    <span className="block text-[15px]">{money(b.total)}</span>
                    <span className={`block text-[13px] ${b.vat > 0 && !b.claim ? "text-strow-amber" : "text-neutral-500"}`}>
                      {ar ? "ض" : "VAT"} {money(b.vat)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Group>
      </Reveal>
    </div>
  );
}
