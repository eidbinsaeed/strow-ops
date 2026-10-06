import Link from "next/link";
import Form from "next/form";
import type { Route } from "next";
import { getLocale } from "@/lib/i18n/locale";
import { todayDubai } from "@/lib/dates";
import { createServiceClient } from "@/lib/supabase/server";
import { PeriodBar } from "@/components/owner/PeriodBar";
import { dayMonth, dayShort, hrefWith, periodLinks, resolvePeriod, type SearchParams } from "@/lib/period";
import {
  PAY_LABEL,
  aed0,
  clockLabel,
  dubaiClock,
  firstSalesDay,
  itemLabel,
  itemsText,
  loadPosOrders,
  loadSalesDays,
  normKey,
  num0,
  posRange,
  type PayKey,
  type PosOrder,
} from "@/lib/sales";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHIPS: ("all" | PayKey)[] = ["all", "card", "talabat", "beanz", "keeta", "cash", "free", "mixed", "other"];
const MAX_ROWS = 600;

const money = (n: number) => (Number.isInteger(n) ? `AED ${n.toLocaleString("en-US")}` : `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const ar = locale === "ar";
  const today = todayDubai();
  const db = createServiceClient();

  const [first, posDates] = await Promise.all([firstSalesDay(db), posRange(db)]);
  // Open on the latest day that has orders (today's POS report usually arrives the next morning).
  const defaultAnchor = posDates.last && posDates.last <= today ? posDates.last : today;
  const period = resolvePeriod(sp, { today, first, defaultGrain: "day", defaultAnchor, locale });
  const links = periodLinks("/owner/orders", sp, period, locale);
  const { from, end } = period;

  const [days, orders] = await Promise.all([
    end >= from ? loadSalesDays(from, end, db) : Promise.resolve(new Map()),
    end >= from ? loadPosOrders(from, end, 5000, db) : Promise.resolve([] as PosOrder[]),
  ]);

  const qRaw = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const q = qRaw.trim().slice(0, 60);
  const needle = normKey(q);
  const payRaw = (Array.isArray(sp.pay) ? sp.pay[0] : sp.pay) ?? "all";
  const pay = (CHIPS as string[]).includes(payRaw) ? (payRaw as (typeof CHIPS)[number]) : "all";

  const matchQ = needle ? orders.filter((o) => o.items.some((it) => normKey(itemLabel(it.name, it.spec)).includes(needle))) : orders;
  const counts = new Map<string, number>([["all", matchQ.length]]);
  for (const o of matchQ) counts.set(o.method, (counts.get(o.method) ?? 0) + 1);
  const shown = pay === "all" ? matchQ : matchQ.filter((o) => o.method === pay);

  const shownTotal = shown.reduce((s, o) => s + o.total, 0);
  const shownItems = shown.reduce((s, o) => s + o.qty, 0);

  // Days with a POS report (orders listed) and days with only the barista's closing.
  const allDays = [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
  const posDays = allDays.filter((d) => d.pos);
  const closingOnly = allDays.filter((d) => !d.pos && d.source === "closing");
  const closedTotal = closingOnly.reduce((s, d) => s + d.total, 0);
  const closedOrders = closingOnly.reduce((s, d) => s + (d.orders ?? 0), 0);

  const byDay = new Map<string, PosOrder[]>();
  let rendered = 0;
  for (const o of shown) {
    if (rendered >= MAX_ROWS) break;
    byDay.set(o.date, [...(byDay.get(o.date) ?? []), o]);
    rendered++;
  }
  const allByDay = new Map<string, number>();
  for (const o of orders) allByDay.set(o.date, (allByDay.get(o.date) ?? 0) + 1);

  const filtered = pay !== "all" || !!needle;
  const posFirstLabel = posDates.first ? dayMonth(posDates.first, locale) : null;
  const chipHref = (c: string) => hrefWith("/owner/orders", sp, { pay: c === "all" ? null : c });

  const kpis = [
    {
      label: ar ? "الطلبات المعروضة" : "Orders shown",
      value: num0(shown.length),
      sub: posDays.length ? (ar ? "من نقاط البيع" : "From the POS") : posFirstLabel ? (ar ? `طلبات نقاط البيع تبدأ ${posFirstLabel}` : `POS orders start ${posFirstLabel}`) : ar ? "لا توجد تقارير بعد" : "No POS reports yet",
    },
    {
      label: ar ? "مجموعها" : "Their total",
      value: aed0(shownTotal),
      sub: shown.length ? `${ar ? "المتوسط" : "Average"} AED ${(shownTotal / shown.length).toFixed(2)}` : "—",
    },
    {
      label: ar ? "الأصناف فيها" : "Items in them",
      value: num0(shownItems),
      sub: shown.length ? `${(shownItems / shown.length).toFixed(1)} ${ar ? "لكل طلب" : "per order"}` : "—",
    },
    {
      label: ar ? "إقفالات بدون تقرير" : "Closing totals",
      value: aed0(closedTotal),
      sub: ar
        ? `${closingOnly.length} ${closingOnly.length === 1 ? "يوم" : "أيام"}${closedOrders ? ` · ${num0(closedOrders)} طلب` : ""}`
        : `${closingOnly.length} ${closingOnly.length === 1 ? "day" : "days"}${closedOrders ? ` · ${num0(closedOrders)} orders` : ""}`,
    },
  ];

  return (
    <div className="page flex flex-col gap-4 md:gap-5">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{ar ? "الطلبات" : "Orders"}</h1>
        <p className="text-sm text-neutral-500">
          {ar
            ? `كل طلب من تقارير نقاط البيع${posFirstLabel ? ` منذ ${posFirstLabel}` : ""}. الأيام الأقدم تُظهر مجموع إقفال الباريستا.`
            : `Every order from the POS reports${posFirstLabel ? `, from ${posFirstLabel}` : ""}. Earlier days show the barista's closing total.`}
        </p>
      </header>

      <PeriodBar links={links} label={period.label} tag={period.tag} custom={period.grain === "custom"} from={period.from} to={period.end} min={first} max={today} locale={locale} />

      <section aria-label={ar ? "تصفية" : "Filters"} className="flex flex-col gap-2.5 rounded-[24px] bg-white p-3 print:hidden">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {CHIPS.filter((c) => c === "all" || c === pay || (counts.get(c) ?? 0) > 0).map((c) => {
            const on = pay === c;
            return (
              <Link
                key={c}
                href={chipHref(c) as Route}
                scroll={false}
                aria-current={on ? "true" : undefined}
                className={`flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-sm transition ${
                  on ? "border-strow-ink bg-strow-ink font-semibold text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-strow-ink"
                }`}
              >
                {c === "all" ? (ar ? "الكل" : "All") : ar ? PAY_LABEL[c].ar : PAY_LABEL[c].en} {counts.get(c) ?? 0}
              </Link>
            );
          })}
        </div>
        <Form action="/owner/orders" className="flex items-center gap-2" scroll={false}>
          {(["p", "d", "from", "to", "pay"] as const).map((k) => {
            const v = Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k];
            return v ? <input key={k} type="hidden" name={k} value={v} /> : null;
          })}
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-[14px] border border-neutral-300 bg-white px-3 focus-within:border-strow-ink">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-neutral-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="sr-only">{ar ? "ابحث عن صنف" : "Find an item"}</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={ar ? "ابحث عن صنف، مثلاً بابكا" : "Find an item, e.g. Babka"}
              className="min-h-10 min-w-0 flex-1 bg-transparent text-[15px] text-strow-ink outline-none"
            />
          </label>
          <button type="submit" className="min-h-11 shrink-0 rounded-full bg-strow-ink px-4 text-sm font-semibold text-white">
            {ar ? "بحث" : "Find"}
          </button>
          {needle ? (
            <Link href={hrefWith("/owner/orders", sp, { q: null }) as Route} scroll={false} className="flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-strow-blue">
              {ar ? "مسح" : "Clear"}
            </Link>
          ) : null}
        </Form>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex min-w-0 flex-col gap-1 rounded-3xl bg-white px-4 py-4">
            <span className="text-[13px] text-neutral-500">{k.label}</span>
            <span className="truncate font-display text-[24px] font-bold tracking-[-0.5px] tabular-nums md:text-[26px]">{k.value}</span>
            <span className="text-[13px] leading-snug text-neutral-500">{k.sub}</span>
          </div>
        ))}
      </div>

      {posDays.map((d) => {
        const list = byDay.get(d.date) ?? [];
        const total = allByDay.get(d.date) ?? 0;
        const listTotal = list.reduce((s, o) => s + o.total, 0);
        const at = clockLabel(dubaiClock(d.pos?.generatedAt), ar);
        return (
          <section key={d.date} className="flex flex-col rounded-[28px] bg-white pb-1.5 pt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-[18px] pb-2.5 md:px-5">
              <h2 className="font-display text-lg font-semibold">{dayShort(d.date, locale)}</h2>
              <span className="rounded-full bg-[#E3EAFB] px-2.5 py-0.5 text-xs font-semibold text-[#1A3FA8]">{ar ? "نقاط البيع" : "POS"}</span>
              <span className="ms-auto text-sm tabular-nums text-neutral-700">
                {filtered
                  ? ar ? `${list.length} من ${total} طلب · ${aed0(listTotal)}` : `${list.length} of ${total} orders · ${aed0(listTotal)}`
                  : ar ? `${total} طلب · ${aed0(d.pos?.total ?? 0)} · تقرير الساعة ${at}` : `${total} orders · ${aed0(d.pos?.total ?? 0)} · report from ${at}`}
              </span>
            </div>
            {list.map((o) => (
              <OrderRow key={o.id} o={o} ar={ar} />
            ))}
            {!list.length ? (
              <p className="border-t border-[#EDF0F3] px-[18px] py-3.5 text-sm text-neutral-500 md:px-5">
                {total ? (ar ? "لا توجد طلبات تطابق هذا البحث." : "No orders match these filters.") : ar ? "لا توجد طلبات في هذا التقرير." : "No orders in this report."}
              </p>
            ) : null}
          </section>
        );
      })}

      {shown.length > MAX_ROWS ? (
        <p className="px-1 text-[13px] text-neutral-500">
          {ar
            ? `يُعرض أحدث ${MAX_ROWS} طلب من ${num0(shown.length)}. اختر فترة أقصر أو ابحث عن صنف.`
            : `Showing the latest ${MAX_ROWS} of ${num0(shown.length)} orders. Pick a shorter period or search for an item.`}
        </p>
      ) : null}

      {closingOnly.length ? (
        <section className="flex flex-col rounded-[28px] bg-white pb-1.5 pt-4">
          <div className="flex flex-col gap-0.5 px-[18px] pb-2.5 md:px-5">
            <h2 className="font-display text-lg font-semibold">{ar ? "أيام بمجموع الإقفال فقط" : "Days with closing totals only"}</h2>
            <span className="text-[13px] text-neutral-500">
              {ar ? "تفاصيل الطلبات تأتي مع تقارير نقاط البيع. " : "Order details come with POS reports. "}
              <Link href="/owner/pos-reports" className="font-semibold text-strow-blue">
                {ar ? "ارفع تقارير هذه الأيام" : "Upload these days' reports"}
              </Link>
            </span>
          </div>
          {closingOnly.map((d) => (
            <div key={d.date} className="flex items-center gap-3 border-t border-[#EDF0F3] px-[18px] py-3 text-sm md:px-5">
              <span className="min-w-0 flex-1 font-semibold">{dayShort(d.date, locale)}</span>
              <span className="tabular-nums text-neutral-500">{d.orders ? `${d.orders} ${ar ? "طلب" : "orders"}` : ar ? "الطلبات غير معدودة" : "orders not counted"}</span>
              <span className="min-w-[78px] text-end font-semibold tabular-nums">{aed0(d.total)}</span>
            </div>
          ))}
        </section>
      ) : null}

      {!posDays.length && !closingOnly.length ? (
        <p className="rounded-[28px] border border-dashed border-neutral-300 px-6 py-8 text-center text-sm text-neutral-500">{ar ? "لا توجد مبيعات مسجلة في هذه الفترة." : "No sales recorded in this period."}</p>
      ) : null}
    </div>
  );
}

function OrderRow({ o, ar }: { o: PosOrder; ar: boolean }) {
  const free = o.method === "free";
  const apps = o.method === "talabat" || o.method === "keeta" || o.method === "beanz";
  const chip = free ? "bg-[#FFF4E0] text-[#6E4200]" : apps ? "bg-[#E3EAFB] text-[#1A3FA8]" : "bg-[#EEF0F3] text-[#333D49]";
  const n = o.qty || o.items.reduce((s, it) => s + it.qty, 0);
  const meta = [
    o.number ? `#${o.number}` : null,
    `${num0(n)} ${ar ? (n === 1 ? "صنف" : "أصناف") : n === 1 ? "item" : "items"}`,
    o.discount > 0 ? `${money(o.discount)} ${ar ? "خصم" : "off"}` : null,
    o.method === "mixed" ? o.payments.map(([name, amt]) => `${name} ${amt}`).join(" + ") : null,
    !free && o.type ? o.type : null,
  ].filter(Boolean);
  return (
    <div className="flex items-start gap-3 border-t border-[#EDF0F3] px-[18px] py-3 text-sm md:px-5">
      <span className="w-[66px] shrink-0 whitespace-nowrap pt-px tabular-nums text-neutral-500">{clockLabel(dubaiClock(o.paidAt), ar)}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold leading-snug">{itemsText(o.items) || "—"}</span>
        <span className="text-[13px] text-neutral-500">{meta.join(" · ")}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 md:flex-row-reverse md:items-center md:gap-3">
        <span className="min-w-[58px] whitespace-nowrap text-end font-semibold tabular-nums">{money(o.total)}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip}`}>{ar ? PAY_LABEL[o.method].ar : PAY_LABEL[o.method].en}</span>
      </span>
    </div>
  );
}
