import Link from "next/link";
import type { Route } from "next";
import { getLocale } from "@/lib/i18n/locale";
import { todayDubai } from "@/lib/dates";
import { createServiceClient } from "@/lib/supabase/server";
import { PeriodBar } from "@/components/owner/PeriodBar";
import {
  addDays,
  dayMonth,
  dayShort,
  eachDay,
  hrefWith,
  monday,
  monthShort,
  nDays,
  periodLinks,
  resolvePeriod,
  weekdayMon,
  weekdayShort,
  type SearchParams,
} from "@/lib/period";
import {
  aed0,
  busiest,
  byHour,
  clockLabel,
  dubaiClock,
  firstSalesDay,
  hourLabel,
  itemTotals,
  loadPosOrders,
  loadProductSales,
  loadSalesDays,
  num0,
  posRange,
  totalsOf,
  type SalesDay,
} from "@/lib/sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Bar = { key: string; label: string; value: number; valueLabel: string; color: string; title: string; dashed?: boolean };

export default async function SalesOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const ar = locale === "ar";
  const today = todayDubai();
  const db = createServiceClient();

  const [first, posDates] = await Promise.all([firstSalesDay(db), posRange(db)]);
  const period = resolvePeriod(sp, { today, first, defaultGrain: "week", locale });
  const links = periodLinks("/owner/sales", sp, period, locale);
  const { from, end, prev } = period;
  const loadFrom = prev.from < from ? prev.from : from;

  const [daysMap, items, orders] = await Promise.all([
    end >= from ? loadSalesDays(loadFrom, end, db) : Promise.resolve(new Map<string, SalesDay>()),
    end >= from ? loadProductSales(from, end, db) : Promise.resolve([]),
    period.grain === "day" && end >= from ? loadPosOrders(from, end, 2000, db) : Promise.resolve([]),
  ]);

  const inPeriod = [...daysMap.values()].filter((d) => d.date >= from && d.date <= end);
  const inPrev = [...daysMap.values()].filter((d) => d.date >= prev.from && d.date <= prev.to);
  const cur = totalsOf(inPeriod);
  const prv = totalsOf(inPrev);
  const change = prv.total > 0 ? Math.round(((cur.total - prv.total) / prv.total) * 100) : null;

  // ── KPIs
  const hours = byHour(orders);
  const peak = busiest(hours);
  const kpis: { label: string; value: string; sub: string; tone?: "up" | "down" }[] = [
    {
      label: ar ? "المبيعات" : "Sales",
      value: aed0(cur.total),
      sub:
        change == null
          ? ar ? "لا توجد مبيعات للمقارنة" : "No sales to compare with"
          : `${change >= 0 ? "+" : "−"}${Math.abs(change)}% ${ar ? "عن" : "vs"} ${period.prevWord}`,
      tone: change == null ? undefined : change >= 0 ? "up" : "down",
    },
    {
      label: ar ? "الطلبات" : "Orders",
      value: cur.orders ? num0(cur.orders) : "—",
      sub:
        cur.daysWithOrders < cur.days
          ? ar ? `عدد الطلبات ناقص في ${cur.days - cur.daysWithOrders} من ${cur.days} أيام` : `Order count missing on ${cur.days - cur.daysWithOrders} of ${cur.days} days`
          : ar ? `${cur.days} أيام فيها مبيعات` : `${cur.days} ${cur.days === 1 ? "day" : "days"} with sales`,
    },
    {
      label: ar ? "متوسط الطلب" : "Average order",
      value: cur.orders ? `AED ${(cur.orderSales / cur.orders).toFixed(2)}` : "—",
      sub: ar ? "من الأيام التي فيها عدد الطلبات" : "Days with an order count",
    },
  ];
  if (period.grain === "day") {
    kpis.push(
      peak
        ? {
            label: ar ? "أكثر الساعات ازدحاماً" : "Busiest hours",
            value: `${hourLabel(peak.from, ar)}–${hourLabel(peak.to % 24, ar)}`,
            sub: `${aed0(peak.total)} · ${cur.total ? Math.round((peak.total / cur.total) * 100) : 0}% ${ar ? "من المبيعات" : "of sales"}`,
          }
        : {
            label: ar ? "الدفع بالبطاقة" : "Paid by card",
            value: cur.total ? `${Math.round((cur.card / cur.total) * 100)}%` : "—",
            sub: cur.total ? `${aed0(cur.card)} ${ar ? "من" : "of"} ${aed0(cur.total)}` : ar ? "لا مبيعات" : "No sales",
          },
    );
  } else {
    kpis.push({
      label: ar ? "متوسط اليوم" : "Daily average",
      value: cur.days ? aed0(cur.total / cur.days) : "—",
      sub: cur.best ? `${ar ? "الأفضل" : "Best"}: ${dayShort(cur.best.date, locale)}, ${aed0(cur.best.total)}` : ar ? "لا أيام مُقفلة" : "No closed days",
    });
  }

  // ── Main chart
  let chartTitle = "";
  let chartNote = "";
  let bars: Bar[] = [];
  let noBars = "";
  if (period.grain === "day") {
    chartTitle = ar ? "حسب الساعة" : "By hour";
    if (hours.length) {
      const inPeak = (h: number) => !!peak && h >= peak.from && h < peak.to;
      bars = hours.map((h) => ({
        key: String(h.hour),
        label: hourLabel(h.hour, ar),
        value: h.total,
        valueLabel: h.total ? num0(h.total) : h.orders ? (ar ? "مجاني" : "free") : "",
        color: h.total ? (inPeak(h.hour) ? "#2350D0" : "#7A93E0") : "#E1E5EA",
        title: `${hourLabel(h.hour, ar)}: ${aed0(h.total)}, ${h.orders} ${ar ? "طلب" : h.orders === 1 ? "order" : "orders"}`,
      }));
      chartNote = ar ? "من تقرير نقاط البيع · الأعمدة الداكنة أكثر الساعات ازدحاماً" : "From the POS report · dark bars are the busiest hours";
    } else {
      const d = daysMap.get(from);
      const posFirst = posDates.first ? dayMonth(posDates.first, locale) : null;
      noBars = d
        ? ar
          ? `لا يوجد تفصيل بالساعة لهذا اليوم: الساعات تأتي من تقارير نقاط البيع${posFirst ? ` التي تبدأ ${posFirst}` : ""}. أقفل الباريستا هذا اليوم على ${aed0(d.total)}${d.orders ? ` من ${d.orders} طلب` : ""}.`
          : `No hourly breakdown for this day: hours come from POS reports${posFirst ? `, which start ${posFirst}` : ""}. The barista closed this day at ${aed0(d.total)}${d.orders ? ` from ${d.orders} orders` : ""}.`
        : ar ? "لا توجد مبيعات مسجلة لهذا اليوم." : "No sales recorded for this day.";
    }
  } else {
    const n = nDays(period.from, period.to);
    const groups: { key: string; label: string; value: number; future: boolean; pos: boolean; missing: boolean; title: string }[] = [];
    if (n <= 31) {
      chartTitle = ar ? "حسب اليوم" : "By day";
      for (const x of eachDay(period.from, period.to)) {
        const d = daysMap.get(x);
        groups.push({
          key: x,
          label: n <= 7 ? weekdayShort(weekdayMon(x), locale) : String(Number(x.slice(8, 10))),
          value: d?.total ?? 0,
          future: x > today,
          pos: d?.source === "pos",
          missing: !d && x <= end && (!first || x >= first),
          title: `${dayShort(x, locale)}${d ? `: ${aed0(d.total)}` : ""}`,
        });
      }
    } else if (n <= 120) {
      chartTitle = ar ? "حسب الأسبوع" : "By week";
      const wk = new Map<string, number>();
      for (const x of eachDay(period.from, end)) wk.set(monday(x), (wk.get(monday(x)) ?? 0) + (daysMap.get(x)?.total ?? 0));
      for (const [m, v] of wk) groups.push({ key: m, label: dayMonth(m, locale), value: v, future: false, pos: false, missing: false, title: `${ar ? "أسبوع" : "Week of"} ${dayMonth(m, locale)}: ${aed0(v)}` });
    } else {
      chartTitle = ar ? "حسب الشهر" : "By month";
      const mo = new Map<string, number>();
      for (const x of eachDay(period.from, end)) mo.set(x.slice(0, 7), (mo.get(x.slice(0, 7)) ?? 0) + (daysMap.get(x)?.total ?? 0));
      for (const [m, v] of mo) groups.push({ key: m, label: monthShort(`${m}-01`, locale), value: v, future: false, pos: false, missing: false, title: `${m}: ${aed0(v)}` });
    }
    const showVals = groups.length <= 10;
    bars = groups.map((g) => ({
      key: g.key,
      label: g.label,
      value: g.value,
      valueLabel: g.value && showVals ? num0(g.value) : g.missing && showVals ? (ar ? "لا شيء" : "none") : "",
      color: g.future ? "transparent" : g.value ? (g.pos ? "#B9C7F3" : "#2350D0") : "#E1E5EA",
      dashed: g.future,
      title: g.title,
    }));
    chartNote = cur.posOnly
      ? ar ? "العمود الفاتح: من نقاط البيع فقط، لم يُقفل بعد" : "Light bar: POS only, not closed yet"
      : groups.some((g) => g.missing)
        ? ar ? "الرمادي: لا يوجد إقفال في ذلك اليوم" : "Grey: no closing that day"
        : ar ? "من إقفالات الباريستا" : "From the barista closings";
  }

  // ── Payments
  const PAY = [
    { name: ar ? "بطاقة" : "Card", v: cur.card, c: "#0F1C2B" },
    { name: ar ? "طلبات" : "Talabat", v: cur.talabat, c: "#2350D0" },
    { name: ar ? "كيتا" : "Keeta", v: cur.keeta, c: "#4F6FD8" },
    { name: "Beanz", v: cur.beanz, c: "#7A93E0" },
    { name: ar ? "تطبيقات غير مفصّلة" : "Apps, not split", v: cur.appsUnsplit, c: "#B9C7F3" },
    { name: ar ? "أخرى" : "Other", v: cur.other, c: "#C9D2E3" },
    { name: ar ? "نقد" : "Cash", v: cur.cash, c: "#97A1AE" },
  ].filter((p) => p.v > 0.004 || p.name === (ar ? "نقد" : "Cash"));
  const apps = cur.talabat + cur.keeta + cur.beanz + cur.appsUnsplit;

  // ── Items
  const top = itemTotals(items).slice(0, 5);
  const itemsSold = items.reduce((s, i) => s + i.qty, 0);
  const posDaysInPeriod = inPeriod.filter((d) => d.pos).sort((a, b) => b.date.localeCompare(a.date));

  // ── Weekdays (closing days only)
  const wsum = [0, 0, 0, 0, 0, 0, 0];
  const wcnt = [0, 0, 0, 0, 0, 0, 0];
  for (const d of inPeriod) {
    if (d.source !== "closing") continue;
    const w = weekdayMon(d.date);
    wsum[w] += d.total;
    wcnt[w]++;
  }
  const wavg = wsum.map((t, i) => (wcnt[i] ? t / wcnt[i] : 0));
  const ranked = [...wavg].sort((a, b) => b - a);
  const showWeekdays = period.grain !== "day" && inPeriod.filter((d) => d.source === "closing").length >= 14;

  const posOnlyDays = inPeriod.filter((d) => d.source === "pos").sort((a, b) => a.date.localeCompare(b.date));
  const recipesHref = hrefWith("/owner/recipes", {}, { tab: "sales", p: period.grain, d: period.grain === "custom" ? null : period.anchor, from: period.grain === "custom" ? period.from : null, to: period.grain === "custom" ? period.end : null });
  const ordersHref = hrefWith("/owner/orders", {}, { p: period.grain, d: period.grain === "custom" ? null : period.anchor, from: period.grain === "custom" ? period.from : null, to: period.grain === "custom" ? period.end : null });

  const firstClosingLabel = first ? dayMonth(first, locale) : null;
  const posFirstLabel = posDates.first ? dayMonth(posDates.first, locale) : null;
  const subtitle = ar
    ? `إقفالات الباريستا${firstClosingLabel ? ` منذ ${firstClosingLabel}` : ""}${posFirstLabel ? `، وتقارير نقاط البيع من ${posFirstLabel}` : ""}`
    : `Barista closings${firstClosingLabel ? ` since ${firstClosingLabel}` : ""}${posFirstLabel ? `, plus POS reports from ${posFirstLabel}` : ""}`;

  return (
    <div className="page flex flex-col gap-4 md:gap-5">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{ar ? "المبيعات" : "Sales"}</h1>
        <p className="text-sm text-neutral-500">{subtitle}</p>
      </header>

      <PeriodBar links={links} label={period.label} tag={period.tag} custom={period.grain === "custom"} from={period.from} to={period.end} min={first} max={today} locale={locale} />

      {posOnlyDays.length ? (
        <div role="status" className="flex items-start gap-3 rounded-[20px] bg-[#FFF4E0] px-4 py-3 text-sm leading-relaxed text-[#6E4200]">
          <ClockIcon />
          <span>
            {posOnlyDays.length === 1
              ? (() => {
                  const d = posOnlyDays[0];
                  const when = d.date === today ? (ar ? "اليوم" : "Today") : dayShort(d.date, locale);
                  const at = clockLabel(dubaiClock(d.pos?.generatedAt), ar);
                  return ar
                    ? `${when} يُحتسب من تقرير نقاط البيع الساعة ${at} (${aed0(d.total)}) حتى يصل إقفال الباريستا.`
                    : `${when} counts the POS report from ${at} (${aed0(d.total)}) until the barista's closing comes in.`;
                })()
              : ar
                ? `${posOnlyDays.length} أيام تُحتسب من تقارير نقاط البيع حتى تصل إقفالات الباريستا.`
                : `${posOnlyDays.length} days count the POS report until the barista's closing comes in.`}
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex min-w-0 flex-col gap-1 rounded-3xl bg-white px-4 py-4 md:px-5">
            <span className="text-[13px] text-neutral-500">{k.label}</span>
            <span className="truncate font-display text-[24px] font-bold tracking-[-0.5px] tabular-nums md:text-[28px]">{k.value}</span>
            <span className={`text-[13px] leading-snug ${k.tone === "up" ? "text-[#0A6B34]" : k.tone === "down" ? "text-[#B42318]" : "text-neutral-500"}`}>{k.sub}</span>
          </div>
        ))}
      </div>
      {cur.waiting ? (
        <p className="-mt-1 px-1 text-[13px] text-neutral-500">
          {ar
            ? `يشمل ${cur.waiting} ${cur.waiting === 1 ? "إقفالاً" : "إقفالات"} بانتظار الموافقة.`
            : `Includes ${cur.waiting} ${cur.waiting === 1 ? "closing" : "closings"} still waiting for approval.`}{" "}
          <Link href="/owner/review" className="font-semibold text-strow-blue">
            {ar ? "الموافقات" : "Approvals"}
          </Link>
        </p>
      ) : null}

      <section className="flex flex-col gap-3.5 rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{chartTitle}</h2>
          <span className="text-[13px] text-neutral-500">{chartNote}</span>
        </div>
        {bars.length ? (
          <Bars bars={bars} height={170} minWidth={period.grain === "day" ? Math.max(320, bars.length * 44) : bars.length > 10 ? Math.max(560, bars.length * 22) : 300} />
        ) : (
          <p className="rounded-[18px] bg-[#F4F5F7] p-4 text-sm leading-relaxed text-neutral-700">{noBars || (ar ? "لا توجد مبيعات في هذه الفترة." : "No sales in this period.")}</p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2.5 rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{ar ? "كيف دفع العملاء" : "How customers paid"}</h2>
            <span className="text-[13px] text-neutral-500">{cur.total ? `${ar ? "عبر التطبيقات" : "Through apps"} ${Math.round((apps / cur.total) * 100)}%` : ""}</span>
          </div>
          {cur.total ? (
            PAY.map((p) => {
              const pc = cur.total ? (p.v / cur.total) * 100 : 0;
              return (
                <div key={p.name} className="flex flex-col gap-1.5 border-t border-[#EDF0F3] py-2">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-semibold">{p.name}</span>
                    <span className="tabular-nums">
                      {aed0(p.v)} · {Math.round(pc)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#EEF0F3]">
                    <div className="pulse-fill h-full rounded-full" style={{ width: `${Math.min(100, pc)}%`, background: p.c }} />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-neutral-500">{ar ? "لا توجد مبيعات في هذه الفترة." : "No sales in this period."}</p>
          )}
          {cur.appsUnsplit > 0 ? (
            <p className="text-[13px] leading-snug text-neutral-500">
              {ar
                ? "بعض الإقفالات لا تفصل مبيعات التطبيقات حسب التطبيق، لذا تظهر كـ«تطبيقات غير مفصّلة»."
                : "Some closings don't split app sales by app, so those show as \"Apps, not split\"."}
            </p>
          ) : null}
        </section>

        <section className="flex min-w-0 flex-col gap-1 rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
            <h2 className="font-display text-lg font-semibold">{ar ? "الأكثر مبيعاً" : "Top sellers"}</h2>
            <Link href={recipesHref as Route} className="flex min-h-11 items-center text-sm font-semibold text-strow-blue">
              {ar ? "كل الأصناف في الوصفات" : "All items in Recipes"}
            </Link>
          </div>
          {top.length ? (
            <>
              {top.map((t, i) => (
                <div key={t.key} className="flex items-center gap-2.5 border-t border-[#EDF0F3] py-2.5 text-sm">
                  <span className="w-[18px] text-end tabular-nums text-neutral-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                  <span className="tabular-nums text-neutral-500">×{num0(t.qty)}</span>
                  <span className="min-w-[72px] text-end font-semibold tabular-nums">{aed0(t.net)}</span>
                </div>
              ))}
              <p className="pt-1 text-[13px] text-neutral-500">
                {ar
                  ? `من تقارير نقاط البيع لـ${posDaysInPeriod.length} ${posDaysInPeriod.length === 1 ? "يوم" : "أيام"} · ${num0(itemsSold)} صنف مُباع`
                  : `From the POS reports of ${posDaysInPeriod.length} ${posDaysInPeriod.length === 1 ? "day" : "days"} · ${num0(itemsSold)} items sold`}
              </p>
            </>
          ) : (
            <p className="rounded-[18px] bg-[#F4F5F7] p-4 text-sm leading-relaxed text-neutral-700">
              {ar
                ? `مبيعات الأصناف تأتي من تقارير نقاط البيع${posFirstLabel ? ` التي تبدأ ${posFirstLabel}` : ""}. ارفع تقارير الأيام القديمة لترى ما بيع فيها.`
                : `Item sales come from POS reports${posFirstLabel ? `, which start ${posFirstLabel}` : ""}. Upload the old days' reports to see what sold then.`}{" "}
              <Link href="/owner/pos-reports" className="font-semibold text-strow-blue">
                {ar ? "ارفع التقارير" : "Upload reports"}
              </Link>
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {showWeekdays ? (
          <section className="flex min-w-0 flex-col gap-3.5 rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">{ar ? "المتوسط حسب يوم الأسبوع" : "Average by weekday"}</h2>
              <span className="text-[13px] text-neutral-500">{ar ? "الداكن: أفضل يومين" : "Dark: your two best days"}</span>
            </div>
            <Bars
              height={130}
              minWidth={260}
              bars={wavg.map((a, i) => ({
                key: String(i),
                label: weekdayShort(i, locale),
                value: a,
                valueLabel: a ? num0(a) : "",
                color: a && a >= ranked[1] ? "#2350D0" : "#B9C7F3",
                title: `${weekdayShort(i, locale)}: ${aed0(a)}`,
              }))}
            />
          </section>
        ) : null}

        <section className="flex min-w-0 flex-col gap-1 rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
            <h2 className="font-display text-lg font-semibold">{ar ? "نقاط البيع مقابل إقفال الباريستا" : "POS vs barista closing"}</h2>
            {posDaysInPeriod.length ? (
              <Link href={ordersHref as Route} className="flex min-h-11 items-center text-sm font-semibold text-strow-blue">
                {ar ? "الطلبات" : "Orders"}
              </Link>
            ) : null}
          </div>
          {posDaysInPeriod.length ? (
            posDaysInPeriod.slice(0, 10).map((d) => {
              const chip = checkChip(d, today, ar);
              return (
                <div key={d.date} className="flex items-center gap-2.5 border-t border-[#EDF0F3] py-2.5 text-sm">
                  <span className="min-w-0 flex-1 font-semibold">{dayShort(d.date, locale)}</span>
                  <span className="tabular-nums">
                    {ar ? "نقاط البيع" : "POS"} {aed0(d.pos?.total ?? 0)}
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${chip.cls}`}>{chip.text}</span>
                </div>
              );
            })
          ) : (
            <p className="text-sm leading-relaxed text-neutral-700">
              {ar
                ? `لا توجد تقارير نقاط بيع في هذه الفترة${posFirstLabel ? `. تبدأ ${posFirstLabel}، فالأيام السابقة فيها إقفال الباريستا فقط` : ""}.`
                : `No POS reports in this period${posFirstLabel ? `. They start ${posFirstLabel}, so earlier days only have the barista's closing` : ""}.`}{" "}
              <Link href="/owner/pos-reports" className="font-semibold text-strow-blue">
                {ar ? "ارفع تقارير قديمة" : "Upload old reports"}
              </Link>
            </p>
          )}
          <p className="pt-1 text-[13px] leading-snug text-neutral-500">
            {ar
              ? "كل يوم فيه الاثنان يُفحص تلقائياً. أي فرق أكثر من درهم يذهب إلى «يحتاجك»."
              : "Every day that has both is checked automatically. A gap over AED 1 goes to Needs you."}
          </p>
        </section>
      </div>
    </div>
  );
}

function checkChip(d: SalesDay, today: string, ar: boolean): { text: string; cls: string } {
  const pos = d.pos;
  if (!pos) return { text: "—", cls: "bg-[#EEF0F3] text-[#3F4A57]" };
  if (d.source === "pos") {
    return d.date >= addDays(today, -1)
      ? { text: ar ? "الإقفال لم يصل بعد" : "Closing not in yet", cls: "bg-[#FFF4E0] text-[#6E4200]" }
      : { text: ar ? "لا يوجد إقفال" : "No closing", cls: "bg-[#EEF0F3] text-[#3F4A57]" };
  }
  const diff = pos.total - d.total;
  if (Math.abs(diff) <= 1) return { text: ar ? "مطابق" : "Matches", cls: "bg-[#E7F6EC] text-[#0A6B34]" };
  if (pos.check.state === "report_before_closing" && diff < 0)
    return { text: ar ? "التقرير قبل الإقفال" : "Report before closing", cls: "bg-[#FFF4E0] text-[#6E4200]" };
  return { text: `${ar ? "فرق" : "Gap"} ${aed0(Math.abs(diff))}`, cls: "bg-[#FBE9E7] text-[#9A1B12]" };
}

function Bars({ bars, height, minWidth }: { bars: Bar[]; height: number; minWidth: number }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
      <div className="flex items-end gap-1.5" style={{ minWidth, height: height + 40 }}>
        {bars.map((b) => (
          <div key={b.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={b.title}>
            <span className="whitespace-nowrap text-[11px] tabular-nums text-neutral-700">{b.valueLabel}</span>
            <div
              className="w-full max-w-[46px] rounded-t-md rounded-b-[2px]"
              style={{
                height: b.value ? Math.max(4, Math.round((b.value / max) * height)) : 2,
                background: b.color,
                border: b.dashed ? "1px dashed #D4D9E0" : undefined,
              }}
            />
            <span className="whitespace-nowrap text-[11px] text-neutral-500">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
