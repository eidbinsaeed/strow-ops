import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { todayDubai } from "@/lib/dates";
import { PeriodBar } from "@/components/owner/PeriodBar";
import { dayMonth, periodLinks, resolvePeriod, type SearchParams } from "@/lib/period";
import { aed0, aed2, itemTotals, loadProductSales, num0, posRange, vatRate, type ItemTotal } from "@/lib/sales";
import { marginTone } from "@/lib/recipes";

type MenuLite = { id: string; name: string; is_active: boolean; source: string };

/** Recipes › Sales: what each item sold, cost and earned in a period (from POS reports). */
export async function RecipesSalesTab({ sp, locale, menu }: { sp: SearchParams; locale: "en" | "ar"; menu: MenuLite[] }) {
  const ar = locale === "ar";
  const today = todayDubai();
  const db = createServiceClient();
  const [range, vat] = await Promise.all([posRange(db), vatRate(db)]);
  const defaultAnchor = range.last && range.last <= today ? range.last : today;
  const period = resolvePeriod(sp, { today, first: range.first, defaultGrain: "day", defaultAnchor, locale });
  const links = periodLinks("/owner/recipes", sp, period, locale);
  const sales = period.end >= period.from ? await loadProductSales(period.from, period.end, db) : [];
  const items = itemTotals(sales);

  const withRecipe = items.filter((i) => i.costStatus !== "no_recipe");
  const without = items.filter((i) => i.costStatus === "no_recipe");
  const qty = items.reduce((s, i) => s + i.qty, 0);
  const net = items.reduce((s, i) => s + i.net, 0);
  const netWith = withRecipe.reduce((s, i) => s + i.net, 0);
  const netWithout = without.reduce((s, i) => s + i.net, 0);
  const costWith = withRecipe.reduce((s, i) => s + (i.recipeCost ?? 0), 0);
  const foodCost = netWith > 0 ? (costWith / (netWith / (1 + vat))) * 100 : null;
  const sold = new Set(items.map((i) => i.menuItemId).filter(Boolean));
  const unsold = menu.filter((m) => m.is_active && !sold.has(m.id)).sort((a, b) => a.name.localeCompare(b.name));
  const fromPos = new Set(menu.filter((m) => m.source === "pos").map((m) => m.id));
  const posFirst = range.first ? dayMonth(range.first, locale) : null;

  const kpis = [
    { label: ar ? "الأصناف المباعة" : "Items sold", value: num0(qty), sub: ar ? `${items.length} صنفاً مختلفاً · ${aed0(net)}` : `${items.length} different items · ${aed0(net)}` },
    {
      label: ar ? "مبيعات لها وصفة" : "Sales with a recipe",
      value: net > 0 ? `${Math.round((netWith / net) * 100)}%` : "—",
      sub: `${aed0(netWith)} ${ar ? "من" : "of"} ${aed0(net)}`,
    },
    {
      label: ar ? "تكلفة الطعام" : "Food cost",
      value: foodCost != null ? `${foodCost.toFixed(1)}%` : "—",
      sub: ar ? "على الأصناف التي لها وصفة، قبل الضريبة" : "On items with a recipe, before VAT",
    },
    {
      label: ar ? "بيع بدون وصفة" : "Sold without a recipe",
      value: ar ? `${without.length} صنف` : `${without.length} ${without.length === 1 ? "item" : "items"}`,
      sub: ar ? `${aed0(netWithout)} من المبيعات بدون تكلفة بعد` : `${aed0(netWithout)} of sales has no cost yet`,
    },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PeriodBar
        links={links}
        label={period.label}
        tag={period.tag}
        note={!sales.length && posFirst ? (ar ? `مبيعات الأصناف تبدأ مع تقرير ${posFirst}` : `Item sales start with the POS report of ${posFirst}`) : undefined}
        custom={period.grain === "custom"}
        from={period.from}
        to={period.end}
        min={range.first}
        max={today}
        locale={locale}
      />

      {!sales.length ? (
        <p className="rounded-[28px] border border-dashed border-neutral-300 px-6 py-8 text-center text-sm leading-relaxed text-neutral-500">
          {range.first
            ? ar
              ? "لا توجد مبيعات أصناف في هذه الفترة. مبيعات الأصناف تأتي من تقارير نقاط البيع اليومية."
              : "No item sales in this period. Item sales come from the daily POS reports."
            : ar
              ? "لا توجد تقارير نقاط بيع بعد."
              : "No POS reports yet."}{" "}
          <Link href="/owner/pos-reports" className="font-semibold text-strow-blue">
            {ar ? "ارفع تقارير الأيام القديمة" : "Upload old days' reports"}
          </Link>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="flex min-w-0 flex-col gap-1 rounded-3xl bg-white px-4 py-4">
                <span className="text-[13px] text-neutral-500">{k.label}</span>
                <span className="truncate font-display text-[24px] font-bold tracking-[-0.5px] tabular-nums md:text-[28px]">{k.value}</span>
                <span className="text-[13px] leading-snug text-neutral-500">{k.sub}</span>
              </div>
            ))}
          </div>

          {withRecipe.length ? (
            <section className="flex flex-col rounded-[28px] bg-white pb-1.5 pt-[18px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-[18px] pb-2.5 md:px-5">
                <h2 className="font-display text-lg font-semibold">{ar ? "مُباع، وله وصفة" : "Sold, with a recipe"}</h2>
                <span className="text-[13px] text-neutral-500">{ar ? "الهامش = المبيعات قبل الضريبة ناقص تكلفة الوصفة" : "Margin = sales before VAT minus recipe cost"}</span>
              </div>
              {withRecipe.map((i) => (
                <CostedRow key={i.key} i={i} vat={vat} ar={ar} />
              ))}
            </section>
          ) : null}

          {without.length ? (
            <section className="flex flex-col rounded-[28px] bg-white pb-1.5 pt-[18px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-[18px] pb-2.5 md:px-5">
                <h2 className="font-display text-lg font-semibold">{ar ? "مُباع، بدون وصفة بعد" : "Sold, no recipe yet"}</h2>
                <span className="text-[13px] text-neutral-500">{ar ? `${aed0(netWithout)} من المبيعات بدون تكلفة بعد` : `${aed0(netWithout)} of sales with no cost yet`}</span>
              </div>
              {without.map((i) => (
                <div key={i.key} className="flex items-center gap-3 border-t border-[#EDF0F3] px-[18px] py-2.5 md:px-5">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold leading-snug">{i.name}</span>
                    {i.menuItemId && fromPos.has(i.menuItemId) ? (
                      <span className="text-[12px] text-[#1A3FA8]">{ar ? "أضيف تلقائياً من نقاط البيع" : "Added automatically from the POS"}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-end text-sm tabular-nums text-neutral-500">×{num0(i.qty)}</span>
                  <span className="min-w-[56px] shrink-0 whitespace-nowrap text-end text-[15px] font-semibold tabular-nums">{i.net > 0 ? aed0(i.net) : ar ? "مجاني" : "free"}</span>
                  <Link
                    href={(i.menuItemId ? `/owner/recipes/${i.menuItemId}` : "/owner/recipes?tab=cards") as Route}
                    className="flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full border border-neutral-300 px-3 text-[13px] font-semibold text-strow-ink transition hover:border-strow-ink md:px-3.5"
                  >
                    {ar ? "أضف الوصفة" : "Add recipe"}
                  </Link>
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}

      {unsold.length ? (
        <section className="flex flex-col gap-3 rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{ar ? "في القائمة، لم يُبع" : "On the menu, not sold"}</h2>
            <span className="text-[13px] text-neutral-500">
              {ar ? `${unsold.length} صنفاً بدون مبيعات في هذه الفترة` : `${unsold.length} ${unsold.length === 1 ? "item" : "items"} had no sales in this period`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unsold.map((m) => (
              <Link key={m.id} href={`/owner/recipes/${m.id}` as Route} className="rounded-full bg-[#EEF0F3] px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-[#E1E5EA]">
                {m.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CostedRow({ i, vat, ar }: { i: ItemTotal; vat: number; ar: boolean }) {
  const cost = i.recipeCost ?? 0;
  const unit = i.unitCost ?? (i.qty ? cost / i.qty : 0);
  const exVat = i.net / (1 + vat);
  const margin = exVat > 0 ? Math.round((1 - cost / exVat) * 100) : null;
  const unitPrice = i.qty ? i.gross / i.qty : 0;
  const freeUnits = unitPrice > 0 ? i.discount / unitPrice : 0;
  const wholeFree = Math.abs(freeUnits - Math.round(freeUnits)) < 0.02 ? Math.round(freeUnits) : null;
  let sub: string;
  if (i.net <= 0) sub = ar ? `مجاني · تكلفة ${aed2(cost)}` : `Given free · ${aed2(cost)} cost`;
  else {
    sub = i.costStatus === "partly_costed" ? (ar ? `${aed2(unit)} حتى الآن · بعض المكونات بدون سعر` : `${aed2(unit)} so far · some ingredients have no price`) : ar ? `${aed2(unit)} للتحضير` : `${aed2(unit)} to make`;
    if (i.discount > 0)
      sub +=
        wholeFree != null && wholeFree > 0
          ? ar
            ? ` · ${wholeFree} من ${num0(i.qty)} مجاناً`
            : ` · ${wholeFree} of ${num0(i.qty)} given free`
          : ar
            ? ` · خصم ${aed0(i.discount)}`
            : ` · ${aed0(i.discount)} discount`;
  }
  return (
    <Link href={(i.menuItemId ? `/owner/recipes/${i.menuItemId}` : "/owner/recipes") as Route} className="flex items-center gap-3 border-t border-[#EDF0F3] px-[18px] py-3 transition hover:bg-neutral-50 md:px-5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold leading-snug">{i.name}</span>
        <span className="text-[13px] leading-snug text-neutral-500">{sub}</span>
      </span>
      <span className="shrink-0 text-end text-sm tabular-nums text-neutral-500">×{num0(i.qty)}</span>
      <span className="flex shrink-0 flex-col items-end gap-1 md:flex-row md:items-center md:gap-3">
        <span className="min-w-[64px] whitespace-nowrap text-end text-[15px] font-semibold tabular-nums">{aed0(i.net)}</span>
        <span className="flex justify-end md:min-w-[96px]">
          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${i.net <= 0 ? "bg-[#FFF4E0] text-[#6E4200]" : marginTone(margin)}`}>
            {i.net <= 0 ? (ar ? "مجاني" : "Free") : margin != null ? `${margin}% ${ar ? "هامش" : "margin"}` : "—"}
          </span>
        </span>
      </span>
    </Link>
  );
}
