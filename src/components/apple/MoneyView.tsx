import Link from "next/link";
import { CashControls } from "@/components/owner/CashControls";
import { CountUpText } from "@/components/ai/CountUp";
import { MonthStrip } from "@/components/pulse/MonthStrip";
import { Reveal } from "@/components/motion/Reveal";
import type { Locale } from "@/lib/i18n/dict";
import { COLOR } from "@/lib/sections";
import { fmt, N, WD_SHORT, type loadMonth } from "@/lib/owner-month";
import { Group, LargeTitle, Row, Rows, Tile } from "./ui";

type Month = Awaited<ReturnType<typeof loadMonth>>;
export type MoneyCounts = { posReports: number; vendors: number; recurring: number; owed: number; approvals: number };

/** Money: the month so far, then every sales, cost and report page. */
export function MoneyView({ m, c, locale }: { m: Month; c: MoneyCounts; locale: Locale }) {
  const ar = locale === "ar";
  const billShare = m.monthSales > 0 ? Math.min(100, Math.round((m.bills.total / m.monthSales) * 100)) : 0;
  const net = m.monthSales - m.bills.total;
  return (
    <div className="page reveal-js">
      <Reveal className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <div data-reveal="">
          <LargeTitle
            title={ar ? "المال" : "Money"}
            subtitle={
              ar
                ? `${m.monthName} حتى الآن · ${m.closedCount} من ${m.elapsed} يوماً مُقفلة`
                : `${m.monthName} so far · ${m.closedCount} of ${m.elapsed} days closed`
            }
          />
        </div>

        <section data-reveal="" className="flex flex-col gap-3 rounded-3xl bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-neutral-500">{ar ? "المبيعات" : "Sales"}</span>
              <span className="text-[28px] font-bold leading-[34px] tabular-nums">
                <CountUpText text={fmt(m.monthSales, 0)} />
              </span>
              <span className="text-[13px] text-neutral-500">AED · {fmt(m.monthOrders, 0)} {ar ? "طلب" : "orders"}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-neutral-500">{ar ? "الفواتير" : "Bills"}</span>
              <span className="text-[28px] font-bold leading-[34px] tabular-nums">
                <CountUpText text={fmt(m.bills.total, 0)} />
              </span>
              <span className="text-[13px] text-neutral-500">AED · {m.bills.count} {ar ? "فاتورة" : m.bills.count === 1 ? "bill" : "bills"}</span>
            </div>
          </div>
          <div role="img" aria-label={ar ? `الفواتير ${billShare}٪ من المبيعات` : `Bills are ${billShare} percent of sales`} className="h-2 overflow-hidden rounded-full bg-[#E5E5EA]">
            <div className="pulse-fill h-2 rounded-full bg-strow-amber" style={{ width: `${billShare}%` }} />
          </div>
          <span className="text-[15px] leading-5 text-neutral-500">
            {ar ? `المبيعات ناقص الفواتير: ${fmt(net, 0)} درهم، قبل الإيجار والرواتب.` : `Sales minus bills: AED ${fmt(net, 0)}, before rent and salaries.`}
          </span>
        </section>

        <section data-reveal="" className="flex flex-col gap-3 rounded-3xl bg-white px-4 pb-3 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[17px] font-semibold">{m.monthName}</span>
            <span className="flex gap-3 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2 w-2 rounded-[2px] bg-strow-ink" />
                {ar ? "مُقفل" : "Closed"}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2 w-2 rounded-[2px] border-[1.5px] border-dashed border-strow-amber" />
                {ar ? "ناقص" : "Missing"}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2 w-2 rounded-full bg-strow-blue" />
                {ar ? "اليوم" : "Today"}
              </span>
            </span>
          </div>
          <MonthStrip days={m.days} />
          {m.missingCount > 0 ? (
            <Link href="/close" className="flex min-h-11 items-center self-start text-[15px] font-semibold text-strow-amber">
              {ar ? `أكمل ${m.missingCount} أيام ناقصة` : `Fill the ${m.missingCount} missing day${m.missingCount === 1 ? "" : "s"}`}
            </Link>
          ) : null}
        </section>

        <Group title={ar ? "المبيعات" : "Sales"}>
          <Rows>
            <Row href="/owner/sales" icon="sales" color={COLOR.blue} label={ar ? "نظرة عامة على المبيعات" : "Sales overview"} detail={fmt(m.monthSales, 0)} />
            <Row href="/owner/orders" icon="orders" color={COLOR.blue} label={ar ? "الطلبات" : "Orders"} detail={fmt(m.monthOrders, 0)} />
            <Row href="/owner/closings" icon="doc" color={COLOR.blue} label={ar ? "الإقفالات" : "Closings"} detail={`${m.closedCount} ${ar ? "من" : "of"} ${m.elapsed}`} tone={m.missingCount ? "warn" : undefined} />
            <Row href="/owner/pos-reports" icon="pos" color={COLOR.blue} label={ar ? "تقارير نقاط البيع" : "POS reports"} detail={c.posReports} />
          </Rows>
        </Group>

        {m.split.length ? (
          <section data-reveal="" className="flex flex-col gap-3 rounded-3xl bg-white p-4">
            <span className="text-[17px] font-semibold">{ar ? "كيف يدفع العملاء" : "How customers pay"}</span>
            <div className="flex h-3 gap-[3px] overflow-hidden rounded-[6px]">
              {m.split.map((s) => (
                <div key={s.k} className="pulse-fill" style={{ width: `${Math.max(2, s.pct)}%`, background: s.c }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
              {m.split.map((s) => (
                <span key={s.k} className="flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.c }} />
                  <strong className="text-[15px]">{s.pct}%</strong> <span className="text-neutral-500">{s.k}</span>
                </span>
              ))}
            </div>
            {m.appFees.sales.total >= 0.5 ? (
              <div className="flex flex-col gap-0.5 rounded-2xl bg-[#F2F2F7] px-3 py-2.5 text-[15px]">
                <span className="flex justify-between gap-2">
                  <span className="text-neutral-500">{ar ? "التطبيقات" : "Apps"}</span>
                  <span className="tabular-nums">{fmt(m.appFees.sales.total, 0)}</span>
                </span>
                <span className="flex justify-between gap-2">
                  <span className="text-neutral-500">{ar ? "رسوم التطبيقات" : "App fees"}</span>
                  <span className="tabular-nums text-strow-amber">−{fmt(m.appFees.fees.total, 0)}</span>
                </span>
                <span className="flex justify-between gap-2 font-semibold">
                  <span>{ar ? "يبقى لك" : "You keep"}</span>
                  <span className="tabular-nums">{fmt(m.appFees.keep, 0)}</span>
                </span>
              </div>
            ) : null}
            {m.channels.length ? (
              <div className="flex flex-col border-t border-[#E5E5EA] pt-2">
                {m.channels.map((s) => (
                  <div key={s.key} className="flex items-center gap-2 py-1 text-[15px]">
                    <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: s.c }} />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="tabular-nums text-neutral-500">
                      {s.orders} {ar ? "طلب" : "orders"}
                    </span>
                    <span className="min-w-[78px] text-end font-semibold tabular-nums">
                      {ar ? "متوسط" : "avg"} {fmt(s.avg, 0)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <span className="text-[13px] text-neutral-500">{m.usingMonth ? (ar ? "هذا الشهر" : "This month") : ar ? "آخر 30 يوماً" : "Last 30 days"}</span>
          </section>
        ) : null}

        <Group title={ar ? "التكاليف" : "Costs"}>
          <Rows>
            <Row href="/owner/expenses" icon="doc" color={COLOR.orange} label={ar ? "الفواتير" : "Bills"} detail={ar ? `${m.bills.count} هذا الشهر` : `${m.bills.count} this month`} />
            {c.approvals > 0 ? (
              <Row href="/owner/review" icon="check" color={COLOR.green} label={ar ? "الموافقات" : "Approvals"} detail={c.approvals} tone="warn" />
            ) : null}
            <Row href="/owner/suppliers" icon="store" color={COLOR.orange} label={ar ? "الموردون" : "Vendors"} detail={c.vendors} />
            <Row href="/owner/fixed-costs" icon="repeat" color={COLOR.orange} label={ar ? "المصاريف الثابتة" : "Recurring costs"} detail={c.recurring || (ar ? "لا شيء بعد" : "None yet")} />
            <Row href="/owner/liabilities" icon="owed" color={COLOR.orange} label={ar ? "المبالغ المستحقة" : "Money owed"} detail={c.owed || undefined} />
          </Rows>
        </Group>

        {m.cash ? (
          <Group title={ar ? "النقد" : "Cash"}>
            <section id="cash" className="scroll-mt-6">
              <CashControls
                cashOnHand={N(m.cash.cash_on_hand)}
                cashInToday={N(m.cash.cash_in_today)}
                cashOutToday={N(m.cash.cash_out_today)}
                cashWithdrawnToday={N(m.cash.cash_withdrawn_today)}
                anchorDate={m.cash.anchor_date}
                needsOpeningCount={Boolean(m.cash.needs_opening_count)}
                locale={locale}
              />
            </section>
          </Group>
        ) : null}

        <Group title={ar ? "التقارير" : "Reports"}>
          <Rows>
            <Row href="/owner/reports" icon="pnl" color={COLOR.purple} label={ar ? "الأرباح والخسائر" : "Profit & loss"} />
            <Row href="/owner/reports/category-breakdown" icon="pie" color={COLOR.purple} label={ar ? "الإنفاق حسب الفئة" : "Spending by category"} />
            <Row href="/owner/reports/vat" icon="vat" color={COLOR.purple} label={ar ? "ضريبة القيمة المضافة" : "VAT"} />
          </Rows>
        </Group>

        <Group title={ar ? "أرقام الشهر" : "Month numbers"}>
          <div className="grid grid-cols-2 gap-3">
            <Tile label={ar ? "صافي متوقع" : "Projected net"} value={<span className={m.projected < 0 ? "text-strow-amber" : ""}><CountUpText text={fmt(m.projected, 0)} from={0.4} /></span>} note={ar ? "بعد رسوم التطبيقات" : "after app fees"} />
            <Tile label={ar ? "تكاليف ثابتة" : "Fixed costs"} value={<CountUpText text={fmt(m.fixedMonthly, 0)} from={0.4} />} note={ar ? "في الشهر" : "a month"} />
            <Tile label={ar ? "متوسط الطلب" : "Average order"} value={m.avgOrder != null ? fmt(m.avgOrder, 1) : "—"} unit="AED" note={ar ? "هذا الشهر" : "this month"} />
            <Tile label={ar ? `على ${m.items.count} صنف` : `Spent on ${m.items.count} items`} value={<CountUpText text={fmt(m.items.spent, 0)} from={0.4} />} note={ar ? "منذ البداية" : "all time"} />
          </div>
        </Group>

        {m.week.length ? (
          <section data-reveal="" className="flex flex-col gap-2.5 rounded-3xl bg-white p-4">
            <span className="text-[17px] font-semibold">{ar ? "متوسط اليوم" : "Average day"}</span>
            {m.week.map((w) => {
              const low = m.week.length > 3 && w === m.week[m.week.length - 1];
              return (
                <div key={w.k} className="flex items-center gap-2.5 text-[15px]">
                  <span className="w-[34px] text-neutral-500">{WD_SHORT[w.k]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-[#E5E5EA]">
                    <div className="pulse-fill h-2 rounded" style={{ width: `${Math.round((w.v / m.weekMax) * 100)}%`, background: low ? "#C55300" : "#1E6EF4" }} />
                  </div>
                  <span className="w-14 text-end font-semibold tabular-nums">{fmt(w.v, 0)}</span>
                </div>
              );
            })}
          </section>
        ) : null}
      </Reveal>
    </div>
  );
}
