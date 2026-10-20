import Link from "next/link";
import type { Route } from "next";
import { CountUpText } from "@/components/ai/CountUp";
import { FlipList } from "@/components/motion/FlipList";
import { Reveal } from "@/components/motion/Reveal";
import { PushToggle } from "@/components/push/PushToggle";
import type { Period, PeriodKey } from "@/lib/home-periods";
import type { Locale } from "@/lib/i18n/dict";
import { COLOR, type IconName } from "@/lib/sections";
import { PeriodCard, PeriodProvider, PeriodTiles } from "./HomePeriod";
import { PinnedCards, type PinView } from "./PinnedCards";
import { Group, Row, Rows, LargeTitle } from "./ui";

export type HomeFinding = { id: string; title: string; sub: string | null; kind: "needs" | "fix" | "check" };
export type HomeData = {
  subtitle: string; // "Figures up to Sunday 19 October"
  periods: Record<PeriodKey, Period> | null;
  initial: PeriodKey;
  last: null | {
    date: string; // "Sunday 19 October"
    who: string | null;
    amount: number;
    orders: number | null;
    avgOrder: number | null;
    compare: { pct: number; label: string } | null; // vs the same weekday a week before
    href: string;
  };
  pos: null | { kind: "ahead"; label: string; amount: number; orders: number; href: string } | { kind: "match" | "gap"; label: string; href: string };
  findings: HomeFinding[];
  openCount: number;
  approvals: number;
  missingDays: number;
  cash: number | null;
  pins: PinView[];
  /** A finished quarter whose VAT return is due in the next 28 days. */
  vatDue: { label: string; due: string; days: number; href: string } | null;
};

const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");
const KIND: Record<HomeFinding["kind"], { icon: IconName; color: string }> = {
  needs: { icon: "alert", color: COLOR.orange },
  fix: { icon: "sparkle", color: COLOR.blue },
  check: { icon: "check", color: COLOR.grey },
};

/**
 * Home: the owner's main dashboard. Sales by week, month or year (ending on the
 * last close — closings come in at the end of the day), what needs you, the
 * last close and the cash in the drawer.
 *
 * Phone order: sales card → Needs you → tiles → pinned AI charts → last close → cash. On a wide
 * screen the right-hand column holds Needs you, the last close and cash. The
 * two column wrappers are `display: contents` on the phone so `order` can
 * interleave them.
 */
export function HomeView({ d, locale }: { d: HomeData; locale: Locale }) {
  const ar = locale === "ar";
  const nothing = !d.findings.length && !d.approvals && !d.missingDays && !d.vatDue;

  const body = (
    <>
      <div className="contents md:flex md:min-w-0 md:flex-col md:gap-6">
        {d.periods ? (
          <>
            <PeriodCard className="order-1" />
            <PeriodTiles className="order-3" />
          </>
        ) : (
          <section data-reveal="" className="order-1 rounded-3xl bg-white px-4 py-8 text-center text-[15px] text-neutral-500">
            {ar ? "لا توجد إقفالات بعد" : "No closings yet"}
          </section>
        )}
        {d.pins.length ? <PinnedCards pins={d.pins} ar={ar} className="order-4" /> : null}
      </div>

      <div className="contents md:flex md:min-w-0 md:flex-col md:gap-6">
        {/* Needs you */}
        <Group
          big
          title={ar ? "يحتاجك" : "Needs you"}
          aside={
            <Link href="/owner/needs-you" className="text-[15px] text-neutral-500">
              {nothing ? (ar ? "لا شيء" : "None") : ar ? `${d.openCount + d.approvals} مفتوحة` : `${d.openCount + d.approvals} open`}
            </Link>
          }
          className="order-2"
        >
          <FlipList enterFrom="above" className="apple-rows overflow-hidden rounded-3xl bg-white">
            {d.findings.map((f) => (
              <Row key={f.id} flipId={f.id} href={`/owner/needs-you?id=${f.id}`} icon={KIND[f.kind].icon} color={KIND[f.kind].color} label={f.title} sub={f.sub ?? undefined} />
            ))}
            {d.approvals > 0 ? (
              <Row
                flipId="approvals"
                href="/owner/review"
                icon="check"
                color={COLOR.green}
                label={ar ? `${d.approvals} بانتظار موافقتك` : `${d.approvals} waiting for your approval`}
                sub={ar ? "إقفالات وفواتير مُعلّقة" : "Held or flagged closings and bills"}
              />
            ) : null}
            {d.missingDays > 0 ? (
              <Row
                flipId="missing"
                href="/close"
                icon="calendar"
                color={COLOR.orange}
                label={ar ? `${d.missingDays} أيام بدون إقفال` : `${d.missingDays} day${d.missingDays === 1 ? "" : "s"} without a close`}
                sub={ar ? "هذا الشهر · أكملها الآن" : "This month · fill them in now"}
              />
            ) : null}
            {d.vatDue ? (
              <Row
                flipId="vat"
                href={d.vatDue.href}
                icon="vat"
                color={COLOR.purple}
                label={ar ? `إقرار الضريبة ${d.vatDue.label}` : `VAT return for ${d.vatDue.label}`}
                sub={ar ? `آخر موعد ${d.vatDue.due} · بعد ${d.vatDue.days} يوماً` : `Due ${d.vatDue.due} · ${d.vatDue.days} day${d.vatDue.days === 1 ? "" : "s"} left`}
              />
            ) : null}
            {nothing ? (
              <div data-flip-id="clear" className="flex min-h-[62px] items-center gap-3 px-4 text-[17px] text-[#008932]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                {ar ? "كل شيء سليم" : "All clear, nothing needs you"}
              </div>
            ) : null}
          </FlipList>
          {d.openCount > d.findings.length ? (
            <Link href="/owner/needs-you" className="px-4 pt-2 text-[15px] font-semibold text-strow-blue">
              {ar ? `عرض الكل (${d.openCount})` : `See all ${d.openCount}`}
            </Link>
          ) : null}
        </Group>

        {/* Last close */}
        {d.last ? (
          <Group big title={ar ? "آخر إقفال" : "Last close"} aside={d.last.who ? <span className="text-[15px] text-neutral-500">{d.last.who}</span> : undefined} className="order-5">
            <div className="flex flex-col rounded-3xl bg-white px-4 pb-3.5 pt-3.5">
              <Link href={d.last.href as Route} className="press flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-semibold">{d.last.date}</span>
                  <span className="text-[28px] font-bold leading-[34px] tabular-nums">
                    <span className="text-[15px] font-semibold text-neutral-500">AED </span>
                    <CountUpText text={fmt0(d.last.amount)} from={0.6} />
                  </span>
                  {d.last.orders ? (
                    <span className="text-[13px] text-neutral-500">
                      {d.last.orders} {ar ? "طلب" : "orders"}
                      {d.last.avgOrder != null ? ` · ${ar ? "متوسط" : "avg"} ${d.last.avgOrder.toFixed(1)}` : ""}
                    </span>
                  ) : null}
                </span>
                {d.last.compare ? (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold ${d.last.compare.pct >= 0 ? "bg-[#E3F4E8] text-[#007A2C]" : "bg-[#FBEADF] text-[#A84700]"}`}>
                    {d.last.compare.pct > 0 ? "+" : ""}
                    {d.last.compare.pct}%
                  </span>
                ) : null}
              </Link>
              {d.last.compare ? <span className="mt-1 text-[13px] text-neutral-500">{d.last.compare.label}</span> : null}
              {d.pos ? (
                d.pos.kind === "ahead" ? (
                  <Link href={d.pos.href as Route} className="press mt-3 flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-[#E8F0FE] px-3.5 py-2 text-[15px] text-[#1650C4]">
                    <span className="font-semibold">{d.pos.label}</span>
                    <span className="font-bold tabular-nums">
                      AED {fmt0(d.pos.amount)} · {d.pos.orders} {ar ? "طلب" : "orders"}
                    </span>
                  </Link>
                ) : (
                  <Link href={d.pos.href as Route} className={`mt-3 border-t border-[#E5E5EA] pt-3 text-[15px] font-semibold ${d.pos.kind === "match" ? "text-[#008932]" : "text-strow-amber"}`}>
                    {d.pos.label}
                  </Link>
                )
              ) : null}
            </div>
          </Group>
        ) : null}

        {/* Cash */}
        {d.cash != null ? (
          <Group className="order-6">
            <Rows>
              <Row href="/owner/hub/money#cash" icon="cash" color={COLOR.orange} label={ar ? "النقد المتوفر" : "Cash on hand"} detail={`AED ${fmt0(d.cash)}`} />
              <Row href="/owner/hub/money" icon="pnl" color={COLOR.blue} label={ar ? "المال وأرقام الشهر" : "Money and month figures"} />
            </Rows>
          </Group>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="page reveal-js">
      <Reveal className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:items-start">
        <div data-reveal="" className="flex flex-col gap-4 md:col-span-2 [&>div:last-child]:mb-0">
          <LargeTitle title={ar ? "الرئيسية" : "Home"} subtitle={d.subtitle} />
          <PushToggle variant="card" locale={locale} />
        </div>
        {d.periods ? (
          <PeriodProvider periods={d.periods} initial={d.initial} ar={ar}>
            {body}
          </PeriodProvider>
        ) : (
          body
        )}
      </Reveal>
    </div>
  );
}
