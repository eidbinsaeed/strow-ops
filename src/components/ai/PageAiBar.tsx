"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/dict";
import { Sparkle } from "@/components/pulse/icons";

type Seg = { href: string; en: string; ar: string; exact?: boolean; also?: string[] };
const SALES: Seg[] = [
  { href: "/owner/sales", en: "Overview", ar: "نظرة عامة" },
  { href: "/owner/orders", en: "Orders", ar: "الطلبات" },
  { href: "/owner/closings", en: "Closings", ar: "الإقفالات" },
  { href: "/owner/pos-reports", en: "POS reports", ar: "تقارير نقاط البيع" },
];
const PURCHASES: Seg[] = [
  { href: "/owner/expenses", en: "Bills", ar: "الفواتير" },
  { href: "/owner/items", en: "Items", ar: "الأصناف" },
  { href: "/owner/suppliers", en: "Vendors", ar: "الموردون" },
  { href: "/owner/fixed-costs", en: "Recurring", ar: "الثابتة" },
];
const TEAM: Seg[] = [
  { href: "/owner/baristas", en: "Staff", ar: "الموظفون" },
  { href: "/owner/attendance", en: "Attendance", ar: "الحضور", exact: true },
  { href: "/owner/attendance/log", en: "Log", ar: "السجل" },
  { href: "/owner/attendance/reports", en: "Staff records", ar: "سجلات الموظفين" },
];
const REPORTS: Seg[] = [
  { href: "/owner/reports", en: "Profit & loss", ar: "الأرباح والخسائر", exact: true, also: ["/owner/reports/monthly-pnl"] },
  { href: "/owner/reports/category-breakdown", en: "Spending", ar: "الإنفاق" },
  { href: "/owner/reports/vat", en: "VAT", ar: "الضريبة" },
  { href: "/owner/liabilities", en: "Money owed", ar: "المستحقات" },
];
const GROUPS = [SALES, PURCHASES, TEAM, REPORTS];

const under = (p: string, x: string) => p === x || p.startsWith(`${x}/`);
const isOn = (p: string, s: Seg) => (s.exact ? p === s.href : under(p, s.href)) || (s.also ?? []).some((x) => under(p, x));

type P = { match: (p: string) => boolean; en: string[]; ar: string[] };

const PROMPTS: P[] = [
  {
    match: (p) => p.startsWith("/owner/sales"),
    en: ["Compare this week with last week", "Which hours are busiest?", "What sells best on weekends?"],
    ar: ["قارن هذا الأسبوع بالأسبوع الماضي", "ما أكثر الساعات ازدحاماً؟", "ما الأكثر مبيعاً في عطلة نهاية الأسبوع؟"],
  },
  {
    match: (p) => p.startsWith("/owner/orders"),
    en: ["Which items are ordered together?", "How many orders came through apps this week?", "List the free and discounted orders"],
    ar: ["ما الأصناف التي تُطلب معاً؟", "كم طلباً جاء عبر التطبيقات هذا الأسبوع؟", "اعرض الطلبات المجانية والمخفّضة"],
  },
  {
    match: (p) => p.startsWith("/owner/pos-reports"),
    en: ["Which days have no POS report?", "Where do the POS totals differ from the closings?"],
    ar: ["ما الأيام التي بدون تقرير نقاط بيع؟", "أين تختلف مجاميع نقاط البيع عن الإقفالات؟"],
  },
  {
    match: (p) => p.startsWith("/owner/closings"),
    en: ["Chart my sales by weekday", "Which days are missing a closing?", "Best and worst days this month"],
    ar: ["ارسم المبيعات حسب أيام الأسبوع", "ما الأيام التي بدون إقفال؟", "أفضل وأسوأ أيام هذا الشهر"],
  },
  {
    match: (p) => p.startsWith("/owner/expenses"),
    en: ["Check my bills for mistakes", "Top suppliers by spend this month", "Any duplicate bills?"],
    ar: ["افحص فواتيري بحثاً عن أخطاء", "أعلى الموردين إنفاقاً هذا الشهر", "هل توجد فواتير مكررة؟"],
  },
  {
    match: (p) => p.startsWith("/owner/items"),
    en: ["Fix the suspicious lines", "Match the unmatched lines to items", "Which items got more expensive?"],
    ar: ["أصلح البنود المشبوهة", "اربط البنود غير المطابقة بالأصناف", "ما الأصناف التي ارتفع سعرها؟"],
  },
  {
    match: (p) => p.startsWith("/owner/recipes"),
    en: ["Which drinks have the lowest margin?", "What sold most this week, and what did it earn?", "Which new POS items still need a recipe?"],
    ar: ["ما المشروبات ذات أقل هامش ربح؟", "ما الأكثر مبيعاً هذا الأسبوع وكم ربح؟", "ما أصناف نقاط البيع الجديدة التي تحتاج وصفة؟"],
  },
  {
    match: (p) => p.startsWith("/owner/review"),
    en: ["Go through the pending items and fix what you can"],
    ar: ["راجع العناصر المعلقة وأصلح ما تستطيع"],
  },
  {
    match: (p) => p.startsWith("/owner/suppliers"),
    en: ["Find duplicate vendors", "Which vendors are missing a TRN?"],
    ar: ["ابحث عن موردين مكررين", "ما الموردون بدون رقم ضريبي؟"],
  },
  {
    match: (p) => p.startsWith("/owner/fixed-costs"),
    en: ["What do fixed costs cost me per day?", "What daily sales do I need to break even?"],
    ar: ["كم تكلفني المصاريف الثابتة يومياً؟", "كم مبيعات يومية أحتاج للتعادل؟"],
  },
  {
    match: (p) => p.startsWith("/owner/liabilities"),
    en: ["Summarise what I owe and who owes me"],
    ar: ["لخّص ما عليّ وما لي"],
  },
  {
    match: (p) => p.startsWith("/owner/reports"),
    en: ["Explain this month's P&L simply", "Where can I save money?", "What daily sales do I need to break even?"],
    ar: ["اشرح الأرباح والخسائر ببساطة", "أين يمكنني التوفير؟", "كم مبيعات يومية أحتاج للتعادل؟"],
  },
  {
    match: (p) => p.startsWith("/owner/attendance") || p.startsWith("/owner/baristas"),
    en: ["Who was late or absent this month?", "Staff cost vs sales"],
    ar: ["من تأخر أو غاب هذا الشهر؟", "تكلفة الموظفين مقابل المبيعات"],
  },
  {
    match: (p) => p.startsWith("/owner/audit"),
    en: ["What changed in the last 24 hours?"],
    ar: ["ما الذي تغيّر خلال آخر 24 ساعة؟"],
  },
  {
    match: (p) => p.startsWith("/owner/categories"),
    en: ["Chart spend by category this month"],
    ar: ["ارسم الإنفاق حسب الفئة هذا الشهر"],
  },
];

const HIDE = ["/owner/finance", "/owner/assistant", "/owner/login", "/owner/needs-you"];

/** Top of each page: a switcher between related pages + one-tap questions for Strow AI. */
export function PageAiBar({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? "";
  if (pathname === "/owner" || HIDE.some((p) => pathname.startsWith(p))) return null;
  const ar = locale === "ar";
  const segs = GROUPS.find((g) => g.some((s) => isOn(pathname, s))) ?? null;
  const hit = PROMPTS.find((p) => p.match(pathname));
  const prompts = hit ? (ar ? hit.ar : hit.en) : [];
  if (!segs && !prompts.length) return null;
  return (
    <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-2.5 px-4 pt-3 sm:px-6 md:px-10 md:pt-6 print:hidden">
      {segs ? (
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
          <div className="inline-flex gap-1 rounded-full bg-white/70 p-1">
            {segs.map((s) => {
              const on = isOn(pathname, s);
              return (
                <Link
                  key={s.href}
                  href={s.href as Route}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm transition ${on ? "bg-strow-ink font-semibold text-white" : "text-neutral-600 hover:text-strow-ink"}`}
                >
                  {ar ? s.ar : s.en}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
      {prompts.length ? (
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-strow-blue text-white">
            <Sparkle className="h-4 w-4" />
          </span>
          {prompts.map((q) => (
            <Link
              key={q}
              href={`/owner/assistant?q=${encodeURIComponent(q)}` as Route}
              className="shrink-0 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-xs text-neutral-700 transition hover:border-strow-blue active:scale-[.97]"
            >
              {q}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
