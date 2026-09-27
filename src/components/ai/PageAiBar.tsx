"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/dict";

type P = { match: (p: string) => boolean; en: string[]; ar: string[] };

const PROMPTS: P[] = [
  {
    match: (p) => p === "/owner",
    en: ["What needs my attention today?", "How is this month going vs last month?", "Why is cash on hand negative?"],
    ar: ["ما الذي يحتاج انتباهي اليوم؟", "كيف هذا الشهر مقارنة بالشهر الماضي؟", "لماذا النقد بالسالب؟"],
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
    match: (p) => p.startsWith("/owner/reports") || p.startsWith("/owner/insights"),
    en: ["Explain this month's P&L simply", "Where can I save money?", "Chart spend by category"],
    ar: ["اشرح الأرباح والخسائر ببساطة", "أين يمكنني التوفير؟", "ارسم الإنفاق حسب الفئة"],
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

const HIDE = ["/owner/finance", "/owner/assistant", "/owner/login"];

/** One-tap, page-aware questions for Strow AI, shown at the top of each page. */
export function PageAiBar({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? "";
  if (HIDE.some((p) => pathname.startsWith(p))) return null;
  const hit = PROMPTS.find((p) => p.match(pathname));
  if (!hit) return null;
  const prompts = locale === "ar" ? hit.ar : hit.en;
  return (
    <div className="mx-auto w-full max-w-[76rem] px-4 pt-3 sm:px-6 md:px-10 print:hidden">
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <span className="ai-orb h-6 w-6 shrink-0" aria-hidden />
        {prompts.map((q) => (
          <Link
            key={q}
            href={`/owner/assistant?q=${encodeURIComponent(q)}` as Route}
            className="shrink-0 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-xs text-neutral-700 shadow-sm transition hover:border-neutral-300 active:scale-[.97]"
          >
            {q}
          </Link>
        ))}
      </div>
    </div>
  );
}
