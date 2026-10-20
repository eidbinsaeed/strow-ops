import Link from "next/link";
import type { Route } from "next";
import { CountUpText } from "@/components/ai/CountUp";
import { FlipList } from "@/components/motion/FlipList";
import { Reveal } from "@/components/motion/Reveal";
import { PushToggle } from "@/components/push/PushToggle";
import type { Locale } from "@/lib/i18n/dict";
import { COLOR, type IconName } from "@/lib/sections";
import { Group, LargeTitle, Row, Tile } from "./ui";

export type TodayBar = { iso: string; letter: string; value: number | null; isLast: boolean };
export type TodayFinding = { id: string; title: string; sub: string | null; kind: "needs" | "fix" | "check" };
export type TodayData = {
  dateLabel: string;
  close: null | {
    title: string; // "Sunday's close"
    who: string | null;
    amount: number;
    compare: { pct: number; label: string } | null; // vs the same weekday a week before
    bars: TodayBar[];
    avg: number;
    total: number;
  };
  pos: null | { kind: "ahead"; label: string; amount: number; orders: number; href: string } | { kind: "match" | "gap"; label: string; href: string };
  findings: TodayFinding[];
  openCount: number;
  approvals: number;
  missingDays: number;
  glance: null | {
    title: string; // "Sunday at a glance"
    orders: number | null;
    avgOrder: number | null;
    total: number;
    appsPct: number | null;
    appsAmount: number;
    appsLead: string | null;
    cash: number;
    cashPct: number;
  };
};

const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");
const KIND: Record<TodayFinding["kind"], { icon: IconName; color: string }> = {
  needs: { icon: "alert", color: COLOR.orange },
  fix: { icon: "sparkle", color: COLOR.blue },
  check: { icon: "check", color: COLOR.grey },
};

function Bars({ bars, avg }: { bars: TodayBar[]; avg: number }) {
  const max = Math.max(1, ...bars.map((b) => b.value ?? 0));
  const h = (v: number) => Math.max(6, Math.round((v / max) * 80));
  const avgBottom = avg > 0 ? Math.round((avg / max) * 80) : null;
  return (
    <>
      <div className="relative mt-4 h-[98px]">
        <div className="absolute inset-x-0 bottom-0 grid h-[98px] grid-cols-7 items-end gap-2">
          {bars.map((b, k) =>
            b.value == null ? (
              <div key={b.iso} className="h-2 rounded-[4px] border-[1.5px] border-dashed border-strow-amber" />
            ) : (
              <div key={b.iso} className="relative" style={{ height: h(b.value) }}>
                {b.isLast ? (
                  <span className="absolute inset-x-[-12px] bottom-[calc(100%+4px)] text-center text-[13px] font-bold text-strow-blue">{fmt0(b.value)}</span>
                ) : null}
                <div className="apple-bar h-full rounded-[7px]" style={{ background: b.isLast ? "#1E6EF4" : "#E5E5EA", animationDelay: `${k * 50}ms` }} />
              </div>
            ),
          )}
        </div>
        {avgBottom != null ? <div className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-[#8E8E93]" style={{ bottom: avgBottom }} /> : null}
      </div>
      <div aria-hidden className="mt-1.5 grid grid-cols-7 gap-2 text-center text-[13px] text-neutral-500">
        {bars.map((b) => (
          <span key={b.iso} className={b.isLast ? "font-bold text-strow-blue" : ""}>
            {b.letter}
          </span>
        ))}
      </div>
    </>
  );
}

/** Today (was Pulse): the last close, what needs you, and the day at a glance. */
export function TodayView({ d, locale }: { d: TodayData; locale: Locale }) {
  const ar = locale === "ar";
  const c = d.close;
  const g = d.glance;
  const ring = g?.appsPct != null ? Math.round((g.appsPct / 100) * 131.9 * 10) / 10 : 0;
  const nothing = !d.findings.length && !d.approvals && !d.missingDays;

  return (
    <div className="page reveal-js">
      <Reveal className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_380px] md:gap-x-6">
        <div data-reveal="" className="flex flex-col gap-4 md:col-span-2 [&>div:last-child]:mb-0">
          <LargeTitle title={ar ? "اليوم" : "Today"} subtitle={d.dateLabel} />
          <PushToggle variant="card" locale={locale} />
        </div>

        {/* Last close */}
        <section data-reveal="" className="flex flex-col rounded-3xl bg-white px-4 pb-3.5 pt-4 md:col-start-1 md:row-start-2">
          {c ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-semibold">{c.title}</span>
                {c.who ? <span className="text-[15px] text-neutral-500">{c.who}</span> : null}
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-[20px] font-semibold text-neutral-500">AED</span>
                <span className="text-[52px] font-bold leading-[1.1] tracking-[-1px] tabular-nums">
                  <CountUpText text={fmt0(c.amount)} duration={1100} />
                </span>
              </div>
              {c.compare ? (
                <span
                  className={`mt-1.5 inline-flex h-7 items-center gap-1.5 self-start rounded-full px-[11px] text-[15px] font-semibold text-white ${c.compare.pct >= 0 ? "bg-[#008932]" : "bg-[#C55300]"}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={c.compare.pct >= 0 ? "" : "rotate-180"} aria-hidden>
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                  {c.compare.label}
                </span>
              ) : null}
              <div role="img" aria-label={c.bars.map((b) => `${b.letter} ${b.value == null ? (ar ? "ناقص" : "missing") : fmt0(b.value)}`).join(", ")}>
                <Bars bars={c.bars} avg={c.avg} />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[#E5E5EA] pt-3 text-[15px]">
                <span className="flex items-center gap-2 text-neutral-500">
                  <span className="w-3.5 border-t-[1.5px] border-dashed border-[#8E8E93]" />
                  {ar ? "المتوسط" : "avg"} {fmt0(c.avg)}
                </span>
                <span className="font-semibold tabular-nums">
                  {ar ? "٧ أيام" : "7 days"} · AED {fmt0(c.total)}
                </span>
              </div>
              {d.pos ? (
                d.pos.kind === "ahead" ? (
                  <Link href={d.pos.href as Route} className="press mt-3 flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-[#E8F0FE] px-3.5 py-2 text-[15px] text-[#1650C4]">
                    <span className="font-semibold">{d.pos.label}</span>
                    <span className="font-bold tabular-nums">
                      AED {fmt0(d.pos.amount)} · {d.pos.orders} {ar ? "طلب" : "orders"}
                    </span>
                  </Link>
                ) : (
                  <Link href={d.pos.href as Route} className={`mt-2 text-[15px] font-semibold ${d.pos.kind === "match" ? "text-[#008932]" : "text-strow-amber"}`}>
                    {d.pos.label}
                  </Link>
                )
              ) : null}
            </>
          ) : (
            <span className="py-6 text-center text-[15px] text-neutral-500">{ar ? "لا توجد إقفالات بعد" : "No closings yet"}</span>
          )}
        </section>

        {/* Needs you */}
        <Group
          big
          title={ar ? "يحتاجك" : "Needs you"}
          aside={
            <Link href="/owner/needs-you" className="text-[15px] text-neutral-500">
              {nothing ? (ar ? "لا شيء" : "None") : ar ? `${d.openCount + d.approvals} مفتوحة` : `${d.openCount + d.approvals} open`}
            </Link>
          }
          className="md:col-start-2 md:row-span-2 md:row-start-2 md:self-start"
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
                sub={ar ? "أكملها الآن" : "Fill them in now"}
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

        {/* The day at a glance */}
        {g ? (
          <Group big title={g.title} className="md:col-start-1 md:row-start-3">
            <div className="grid grid-cols-2 gap-3">
              <Tile label={ar ? "الطلبات" : "Orders"} value={g.orders != null ? <CountUpText text={String(g.orders)} /> : "—"} note={ar ? "من نقاط البيع" : "from the POS"} />
              <Tile
                label={ar ? "متوسط الطلب" : "Average order"}
                value={g.avgOrder != null ? g.avgOrder.toFixed(1) : "—"}
                unit={g.avgOrder != null ? "AED" : undefined}
                note={g.orders ? `${fmt0(g.total)} ÷ ${g.orders} ${ar ? "طلب" : "orders"}` : undefined}
              />
              <Tile
                label={ar ? "تطبيقات التوصيل" : "Delivery apps"}
                value={g.appsPct != null ? `${g.appsPct}%` : "—"}
                note={g.appsAmount > 0 ? `${fmt0(g.appsAmount)} AED${g.appsLead ? ` · ${g.appsLead} ${ar ? "الأعلى" : "led"}` : ""}` : undefined}
              >
                {g.appsPct != null ? (
                  <svg width="40" height="40" viewBox="0 0 52 52" aria-hidden>
                    <circle cx="26" cy="26" r="21" fill="none" stroke="#E5E5EA" strokeWidth="8" />
                    <circle cx="26" cy="26" r="21" fill="none" stroke="#1E6EF4" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${ring} 131.9`} transform="rotate(-90 26 26)" />
                  </svg>
                ) : null}
              </Tile>
              <Tile label={ar ? "النقد" : "Cash"} value={<CountUpText text={fmt0(g.cash)} />} unit="AED" note={ar ? `${g.cashPct}٪ من اليوم` : `${g.cashPct}% of the day`} href="/owner/hub/money#cash" />
            </div>
          </Group>
        ) : null}
      </Reveal>
    </div>
  );
}
