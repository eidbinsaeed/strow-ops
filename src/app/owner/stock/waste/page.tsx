import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { getSettings } from "@/lib/settings";
import { shortDay, todayDubai } from "@/lib/dates";
import { WEEKDAYS_AR, WEEKDAYS_EN } from "@/lib/stock";
import {
  fmtBase,
  isFullCountDay,
  nextFullCount,
  toWastePeriod,
  toWasteRow,
  totals,
  verdict,
  type WasteRow,
  type WasteStatus,
} from "@/lib/waste";

export const dynamic = "force-dynamic";

const SECTION = "rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]";
const LOOKBACK = 14;

type TakeRow = {
  take_date: string;
  take_at: string;
  shop_lines: number;
  store_lines: number;
  shop_barista_id: string | null;
  store_barista_id: string | null;
};

const aed = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;
const signedAed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}AED ${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const signed = (n: number, uom: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtBase(Math.abs(n), uom)}`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Dubai" });
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function WastePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ar = (await getLocale()) === "ar";
  const t = (en: string, arText: string) => (ar ? arText : en);
  const db = createServiceClient();
  const today = todayDubai();
  const since = addDays(today, -LOOKBACK);

  const { data: loc } = await db.from("locations").select("id").eq("is_active", true).limit(1).maybeSingle();
  const locationId = (loc as { id: string } | null)?.id ?? "";

  const [settings, takesRes, groupsRes, listRes, usageRes, boughtRes, noRecipeRes, staffRes] = await Promise.all([
    getSettings(),
    db.from("v_stock_takes").select("take_date, take_at, shop_lines, store_lines, shop_barista_id, store_barista_id").eq("location_id", locationId).order("take_date", { ascending: false }).limit(26),
    db.from("v_inventory_groups").select("item_id, group_id"),
    db.from("stock_items").select("id, name, place, inventory_item_id, base_per_unit").eq("location_id", locationId).eq("is_active", true),
    db.from("v_pos_ingredient_usage").select("inventory_item_id, ingredient, base_uom, qty_used, cost").eq("location_id", locationId).gt("business_date", since).lte("business_date", today),
    db.from("v_purchase_lines").select("inventory_item_id").eq("location_id", locationId).gte("expense_date", addDays(today, -90)),
    db.from("v_pos_product_sales").select("product, variant, qty").eq("location_id", locationId).eq("cost_status", "no_recipe").gt("business_date", since).lte("business_date", today),
    db.from("baristas").select("id, name"),
  ]);

  const missingTables = takesRes.error && /v_stock_takes|does not exist/i.test(takesRes.error.message);
  const takes = (takesRes.data ?? []) as TakeRow[];
  const staffName = new Map(((staffRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const days = ar ? WEEKDAYS_AR : WEEKDAYS_EN;

  // ── The period: two stock takes, the latest pair unless picked. ─────────────
  const dates = takes.map((x) => x.take_date);
  const to = sp.to && ISO.test(sp.to) && dates.includes(sp.to) ? sp.to : dates[0];
  const picked = sp.from && ISO.test(sp.from) && dates.includes(sp.from) ? sp.from : undefined;
  // dates are newest first, so find() gives the latest full count before `to`.
  const from = picked && to && picked < to ? picked : dates.find((d) => !!to && d < to);
  const canRun = !!from && !!to && from < to;

  let rows: WasteRow[] = [];
  let period = null as ReturnType<typeof toWastePeriod>;
  let runError: string | null = null;
  if (canRun) {
    const [w, p] = await Promise.all([
      db.rpc("stock_waste", { p_from: from, p_to: to }),
      db.rpc("stock_waste_period", { p_from: from, p_to: to }),
    ]);
    if (w.error) runError = w.error.message;
    rows = ((w.data ?? []) as Record<string, unknown>[]).map(toWasteRow);
    period = toWastePeriod(((p.data ?? []) as Record<string, unknown>[])[0]);
  }
  const sum = totals(rows);
  const okRows = rows.filter((r) => r.status === "ok");
  const blocked = rows.filter((r) => r.status !== "ok" && r.status !== "no_recipe" && (r.should_use > 0 || r.used !== 0 || r.bought > 0));
  const supplies = rows.filter((r) => r.status === "no_recipe" && r.used > 0);
  const salesEx = period?.sales_ex_vat ?? 0;
  const pctOfSales = (n: number) => (salesEx > 0 ? `${((n / salesEx) * 100).toFixed(1)}%` : "–");

  // ── Ready check: what would stop the next waste check from being right. ──────
  const groupOf = new Map(((groupsRes.data ?? []) as { item_id: string; group_id: string }[]).map((g) => [g.item_id, g.group_id]));
  const gid = (id: string | null) => (id ? groupOf.get(id) ?? id : null);
  const list = (listRes.data ?? []) as { id: string; name: string; place: string; inventory_item_id: string | null; base_per_unit: number | string | null }[];
  const onList = new Set(list.map((l) => gid(l.inventory_item_id)).filter(Boolean) as string[]);
  const usedGroups = new Map<string, { name: string; cost: number }>();
  for (const u of (usageRes.data ?? []) as { inventory_item_id: string | null; ingredient: string; qty_used: number | string; cost: number | string | null }[]) {
    const g = gid(u.inventory_item_id);
    if (!g || !(Number(u.qty_used) > 0)) continue;
    const cur = usedGroups.get(g) ?? { name: u.ingredient, cost: 0 };
    cur.cost += Number(u.cost) || 0;
    if (g === u.inventory_item_id) cur.name = u.ingredient;
    usedGroups.set(g, cur);
  }
  const boughtGroups = new Set(((boughtRes.data ?? []) as { inventory_item_id: string }[]).map((b) => gid(b.inventory_item_id)).filter(Boolean) as string[]);
  const notListed = [...usedGroups.entries()].filter(([g]) => !onList.has(g)).sort((a, b) => b[1].cost - a[1].cost);
  const noSize = list.filter((l) => l.base_per_unit === null && l.inventory_item_id && usedGroups.has(gid(l.inventory_item_id) as string));
  const noBills = [...usedGroups.entries()].filter(([g, u]) => onList.has(g) && !boughtGroups.has(g) && u.cost >= 20).sort((a, b) => b[1].cost - a[1].cost);
  const noRecipe = new Map<string, number>();
  for (const p of (noRecipeRes.data ?? []) as { product: string; variant: string | null; qty: number | string }[]) {
    const k = p.variant ? `${p.product} (${p.variant})` : p.product;
    noRecipe.set(k, (noRecipe.get(k) ?? 0) + (Number(p.qty) || 0));
  }
  const usedCost14 = [...usedGroups.values()].reduce((s, u) => s + u.cost, 0);
  const listedCost14 = [...usedGroups.entries()].filter(([g]) => onList.has(g)).reduce((s, [, u]) => s + u.cost, 0);

  const fullDay = nextFullCount(today, settings.storeCountDay);
  const countedToday = takes.some((x) => x.take_date === today);
  const nextTake = countedToday ? nextFullCount(addDays(today, 1), settings.storeCountDay) : fullDay;
  const firstNumbers = takes.length === 0 ? nextFullCount(addDays(nextTake, 1), settings.storeCountDay) : takes.length === 1 ? nextTake : null;

  const statusText: Record<Exclude<WasteStatus, "ok" | "no_recipe">, { en: string; ar: string }> = {
    not_counted: { en: "Not counted at one of the two full counts", ar: "لم يُعدّ في أحد الجردين" },
    no_size: { en: "A count line has no size (how many kg / L / pieces in one)", ar: "سطر في قائمة العدّ بلا حجم (كم كغ / لتر / قطعة في الوحدة)" },
    unit_mismatch: { en: "Bills and recipe use different units (kg vs pieces)", ar: "الفواتير والوصفة بوحدات مختلفة (كغ مقابل قطع)" },
    missing_bills: { en: "Stock went up with no bill: a delivery is missing", ar: "زاد المخزون بدون فاتورة: توريد مفقود" },
    not_on_list: { en: "Recipes use it, but it is on no count list", ar: "تستخدمه الوصفات لكنه ليس في أي قائمة عدّ" },
  };

  const header = (
    <header className="px-1">
      <Link href={"/owner/stock" as Route} className="text-[13px] font-semibold text-strow-blue">
        {t("← Stock", "→ المخزون")}
      </Link>
      <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{t("Waste check", "فحص الهدر")}</h1>
      <p className="text-sm text-neutral-500">
        {t(
          "What you really used (counts + bills) against what the POS says you should have used (sales × recipes), between two full counts.",
          "ما استخدمته فعلاً (العدّ + الفواتير) مقابل ما يجب أن يُستخدم حسب نقاط البيع (المبيعات × الوصفات)، بين جردين كاملين.",
        )}
      </p>
    </header>
  );

  if (missingTables) {
    return (
      <div className="page flex flex-col gap-4 md:gap-5">
        {header}
        <p className="rounded-[28px] bg-[#FBE9E7] px-[18px] py-5 text-sm text-[#9A1B12] md:p-[22px]">
          {t("The waste check is not in the database yet", "فحص الهدر غير موجود في قاعدة البيانات بعد")} — 0025_waste_check.sql.
        </p>
      </div>
    );
  }

  return (
    <div className="page flex flex-col gap-4 md:gap-5">
      {header}

      {/* How it works, in one line each */}
      <section className="rounded-[24px] bg-white p-4 text-[13px] leading-relaxed text-neutral-600">
        <p>
          <span className="font-semibold text-strow-ink">{t("Used", "المستخدم")}</span> = {t("start count + bought − end count", "عدّ البداية + المشتريات − عدّ النهاية")}
        </p>
        <p>
          <span className="font-semibold text-strow-ink">{t("Should use", "المفترض")}</span> = {t("POS items sold × recipes", "المبيعات × الوصفات")}
        </p>
        <p>
          <span className="font-semibold text-strow-ink">{t("Unexplained", "غير المبرَّر")}</span> = {t("used − should use − logged thrown away", "المستخدم − المفترض − التالف المسجّل")}
        </p>
        <p className="mt-1.5 text-xs text-neutral-500">
          {t(
            `A full count = the shop and the store room counted the same day, every item. Yours is every ${days[settings.storeCountDay]}, before opening.`,
            `الجرد الكامل = عدّ المحل والمخزن في اليوم نفسه، كل الأصناف. موعده يوم ${days[settings.storeCountDay]} من كل أسبوع، قبل الفتح.`,
          )}
        </p>
      </section>

      {/* Period */}
      {takes.length >= 2 ? (
        <form method="get" className="flex flex-wrap items-end gap-2 rounded-[24px] bg-white p-4">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-neutral-500">
            {t("From full count", "من جرد")}
            <select name="from" defaultValue={from} className="h-11 rounded-xl border border-neutral-300 bg-neutral-50 px-2 text-[15px] text-strow-ink">
              {takes.slice(1).map((x) => (
                <option key={x.take_date} value={x.take_date}>
                  {shortDay(x.take_date)} {timeOf(x.take_at)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-neutral-500">
            {t("To full count", "إلى جرد")}
            <select name="to" defaultValue={to} className="h-11 rounded-xl border border-neutral-300 bg-neutral-50 px-2 text-[15px] text-strow-ink">
              {takes.slice(0, -1).map((x) => (
                <option key={x.take_date} value={x.take_date}>
                  {shortDay(x.take_date)} {timeOf(x.take_at)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-11 rounded-xl bg-strow-ink px-4 text-[15px] font-semibold text-white">
            {t("Show", "عرض")}
          </button>
        </form>
      ) : (
        <section className={SECTION}>
          <h2 className="font-display text-lg font-semibold">{t("Waiting for two full counts", "بانتظار جردين كاملين")}</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {takes.length === 0
              ? t("No full count yet.", "لا يوجد جرد كامل بعد.")
              : t(`One full count so far: ${shortDay(takes[0].take_date)}.`, `جرد كامل واحد حتى الآن: ${shortDay(takes[0].take_date)}.`)}{" "}
            {t(`Next full count: ${shortDay(nextTake)}.`, `الجرد الكامل التالي: ${shortDay(nextTake)}.`)}
            {firstNumbers ? ` ${t(`First waste numbers: ${shortDay(firstNumbers)}.`, `أول أرقام للهدر: ${shortDay(firstNumbers)}.`)}` : ""}
          </p>
          {!settings.staffShopCount || !settings.staffStoreCount ? (
            <p className="mt-2 rounded-xl bg-[#FFF7E8] px-3 py-2 text-[13px] font-semibold text-strow-amber">
              {t("Staff can't count yet: turn on ", "لا يستطيع الموظفون العدّ بعد: فعّل ")}
              {[!settings.staffShopCount ? t("Shop stock", "عدّ المحل") : null, !settings.staffStoreCount ? t("Store room count", "جرد المخزن") : null]
                .filter(Boolean)
                .join(t(" and ", " و"))}{" "}
              <Link href={"/owner/stock" as Route} className="underline">
                {t("on the Stock page", "من صفحة المخزون")}
              </Link>
              .
            </p>
          ) : null}
        </section>
      )}

      {runError ? <p className="rounded-[24px] bg-[#FBE9E7] p-4 text-sm text-[#9A1B12]">{runError}</p> : null}

      {canRun && period ? (
        <>
          <section className={SECTION}>
            <p className="text-xs text-neutral-500">
              {shortDay(from!)} {timeOf(period.t0)} → {shortDay(to!)} {timeOf(period.t1)} · {t("bills dated", "فواتير بتاريخ")} {shortDay(period.bills_from)}–{shortDay(period.bills_to)} ·{" "}
              {Math.round(period.items_sold)} {t("items sold", "صنف مباع")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-neutral-500">{t("Unexplained loss", "خسارة غير مبرَّرة")}</p>
                <p className={`font-display text-[26px] font-bold tabular-nums ${sum.unexplainedCost > 0 ? "text-strow-amber" : ""}`}>{signedAed(sum.unexplainedCost)}</p>
                <p className="text-xs text-neutral-500">{pctOfSales(sum.unexplainedCost)} {t("of sales", "من المبيعات")}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">{t("Thrown away (logged)", "التالف (المسجّل)")}</p>
                <p className="font-display text-[26px] font-bold tabular-nums">{aed(sum.wasteCost)}</p>
                <p className="text-xs text-neutral-500">{pctOfSales(sum.wasteCost)} {t("of sales", "من المبيعات")}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">{t("Recipes say", "حسب الوصفات")}</p>
                <p className="text-[17px] font-semibold tabular-nums">{aed(sum.shouldCost)}</p>
                <p className="text-xs text-neutral-500">{pctOfSales(sum.shouldCost)} {t("of sales", "من المبيعات")}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">{t("Really used", "المستخدم فعلاً")}</p>
                <p className="text-[17px] font-semibold tabular-nums">{aed(sum.usedCost)}</p>
                <p className="text-xs text-neutral-500">{pctOfSales(sum.usedCost)} {t("of sales", "من المبيعات")}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              {t(
                `Sales ${aed(salesEx)} before VAT. ${sum.checked} items checked, ${Math.round(sum.coverage * 100)}% of what the recipes use. Costs before VAT, at what you paid in the period (else the last bill).`,
                `المبيعات ${aed(salesEx)} قبل الضريبة. فُحص ${sum.checked} صنفاً، ${Math.round(sum.coverage * 100)}% مما تستخدمه الوصفات. التكلفة قبل الضريبة بسعر الشراء في الفترة (أو آخر فاتورة).`,
              )}
            </p>
            {period.missing_report_days.length ? (
              <p className="mt-2 rounded-xl bg-[#FFF7E8] px-3 py-2 text-[13px] font-semibold text-strow-amber">
                {t("No POS report yet for", "لا يوجد تقرير نقاط بيع بعد ليوم")} {period.missing_report_days.map(shortDay).join(", ")}
                {t(": “should use” is too low until it comes in.", ": رقم «المفترض» أقل من الحقيقي حتى يصل.")}
              </p>
            ) : null}
          </section>

          <section className="rounded-[28px] bg-white pb-1.5 pt-[18px] md:pt-6">
            <h2 className="px-[18px] pb-1 font-display text-lg font-semibold md:px-6">{t("Item by item", "صنفاً صنفاً")}</h2>
            <p className="px-[18px] pb-2 text-xs text-neutral-500 md:px-6">{t("Biggest gap first. Tap an item for its counts and bills.", "الأكبر فرقاً أولاً. اضغط الصنف لترى العدّ والفواتير.")}</p>
            {okRows.length === 0 ? (
              <p className="border-t border-[#EDF0F3] px-[18px] py-5 text-sm text-neutral-500 md:px-6">{t("Nothing could be checked in this period.", "لم يمكن فحص أي صنف في هذه الفترة.")}</p>
            ) : (
              okRows.map((r) => <WasteItem key={r.group_id} r={r} ar={ar} />)
            )}
          </section>

          {blocked.length ? (
            <section className="rounded-[28px] bg-white pb-1.5 pt-[18px] md:pt-6">
              <h2 className="px-[18px] pb-1 font-display text-lg font-semibold md:px-6">{t("Can't check these yet", "لا يمكن فحصها بعد")}</h2>
              <p className="px-[18px] pb-2 text-xs text-neutral-500 md:px-6">{t("Fix the reason and the next check includes them.", "أصلح السبب وستدخل في الفحص القادم.")}</p>
              {blocked.map((r) => {
                const why = statusText[r.status as Exclude<WasteStatus, "ok" | "no_recipe">];
                const missingNames =
                  r.status === "not_counted"
                    ? [...(r.detail.missing_start ? (r.detail.start ?? []) : []), ...(r.detail.missing_end ? (r.detail.end ?? []) : [])].filter((l) => l.qty === null).map((l) => l.name)
                    : [];
                return (
                  <div key={r.group_id} className="border-t border-[#EDF0F3] px-[18px] py-3 md:px-6">
                    <div className="flex justify-between gap-3">
                      <span className="text-[15px] font-semibold">{r.name}</span>
                      {r.should_cost ? <span className="shrink-0 text-xs text-neutral-500 tabular-nums">{t("recipes", "الوصفات")} {aed(r.should_cost)}</span> : null}
                    </div>
                    <p className="text-xs font-semibold text-strow-amber">{why ? (ar ? why.ar : why.en) : r.status}</p>
                    {missingNames.length ? <p className="text-xs text-neutral-500">{[...new Set(missingNames)].join(", ")}</p> : null}
                    {r.status === "missing_bills" ? (
                      <p className="text-xs text-neutral-500">
                        {t("Start", "البداية")} {fmtBase(r.opening ?? 0, r.base_uom)} + {t("bills", "فواتير")} {fmtBase(r.bought, r.base_uom)} · {t("end", "النهاية")} {fmtBase(r.closing ?? 0, r.base_uom)}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}

          {supplies.length ? (
            <details className="group rounded-[28px] bg-white px-[18px] py-4 md:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span>
                  <span className="block font-display text-lg font-semibold">{t("Used, not in any recipe", "مستخدم وليس في أي وصفة")}</span>
                  <span className="block text-xs text-neutral-500">
                    {supplies.length} {supplies.length === 1 ? t("item", "صنف") : t("items", "صنف")} · {aed(supplies.reduce((s, r) => s + (r.used_cost ?? 0), 0))} · {t("cleaning, supplies, or a recipe that is missing", "تنظيف ومستلزمات أو وصفة ناقصة")}
                  </span>
                </span>
                <span className="text-neutral-400 transition group-open:rotate-90" aria-hidden="true">
                  ›
                </span>
              </summary>
              <div className="mt-2">
                {supplies.map((r) => (
                  <div key={r.group_id} className="flex justify-between gap-3 border-t border-[#EEF1F4] py-2 text-sm">
                    <span>{r.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {fmtBase(r.used, r.base_uom)}
                      {r.used_cost !== null ? <span className="text-neutral-500"> · {aed(r.used_cost)}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </>
      ) : null}

      {/* Ready check: always visible, so the next count is right */}
      <section className={SECTION}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t("Ready check", "فحص الجاهزية")}</h2>
          <span className="text-xs text-neutral-500">{t(`last ${LOOKBACK} days of sales`, `آخر ${LOOKBACK} يوماً من المبيعات`)}</span>
        </div>
        <ReadyLine
          ok={usedCost14 > 0 && listedCost14 / usedCost14 >= 0.95}
          title={t(
            `${usedCost14 > 0 ? Math.round((listedCost14 / usedCost14) * 100) : 0}% of what the recipes use is on a count list`,
            `${usedCost14 > 0 ? Math.round((listedCost14 / usedCost14) * 100) : 0}% مما تستخدمه الوصفات موجود في قوائم العدّ`,
          )}
          detail={notListed.length ? notListed.slice(0, 6).map(([, u]) => `${u.name} (${aed(u.cost)})`).join(", ") : null}
          link={notListed.length ? { href: "/owner/stock/lists", label: t("Add to a list", "أضف إلى قائمة") } : null}
        />
        <ReadyLine
          ok={noSize.length === 0}
          title={noSize.length ? t(`${noSize.length} count ${noSize.length === 1 ? "line has" : "lines have"} no size`, `${noSize.length} من أسطر العدّ بلا حجم`) : t("Every count line the recipes need has a size", "كل أسطر العدّ التي تحتاجها الوصفات لها حجم")}
          detail={noSize.length ? noSize.map((l) => l.name).join(", ") : null}
          link={noSize.length ? { href: "/owner/stock/lists", label: t("Set sizes", "حدد الأحجام") } : null}
        />
        <ReadyLine
          ok={noBills.length === 0}
          title={noBills.length ? t(`${noBills.length} ${noBills.length === 1 ? "item" : "items"} sold with no bill in 90 days`, `${noBills.length} من الأصناف بيعت بدون فاتورة خلال 90 يوماً`) : t("Everything sold has a bill in the last 90 days", "كل ما بيع له فاتورة خلال آخر 90 يوماً")}
          detail={noBills.length ? `${noBills.map(([, u]) => u.name).join(", ")}. ${t("Fine if it is old stock. If it is delivered regularly, scan those bills, or the check shows a missing delivery.", "لا بأس إن كان مخزوناً قديماً. إن كان يُورَّد بانتظام فامسح فواتيره، وإلا يظهر في الفحص كتوريد مفقود.")}` : null}
          link={null}
        />
        <ReadyLine
          ok={noRecipe.size === 0}
          title={noRecipe.size ? t(`${noRecipe.size} POS ${noRecipe.size === 1 ? "item" : "items"} sold without a recipe`, `${noRecipe.size} من أصناف نقاط البيع بيعت بدون وصفة`) : t("Everything sold has a recipe", "كل ما بيع له وصفة")}
          detail={
            noRecipe.size
              ? [...noRecipe.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([k, q]) => `${k} ×${Math.round(q)}`)
                  .join(", ")
              : null
          }
          link={noRecipe.size ? { href: "/owner/recipes", label: t("Recipes", "الوصفات") } : null}
        />
        <ReadyLine
          ok={settings.staffShopCount && settings.staffStoreCount}
          title={
            settings.staffShopCount && settings.staffStoreCount
              ? t(`Staff count the shop daily and the store room every ${days[settings.storeCountDay]}`, `يعدّ الموظفون المحل يومياً والمخزن يوم ${days[settings.storeCountDay]} من كل أسبوع`)
              : t("Staff counts are switched off", "عدّ الموظفين مغلق")
          }
          detail={
            isFullCountDay(today, settings.storeCountDay) && !countedToday
              ? t("Today is the full count: shop and store room, every item.", "اليوم جرد كامل: المحل والمخزن، كل الأصناف.")
              : t(`Next full count: ${shortDay(nextTake)}.`, `الجرد الكامل التالي: ${shortDay(nextTake)}.`)
          }
          link={settings.staffShopCount && settings.staffStoreCount ? null : { href: "/owner/stock", label: t("Switch on", "فعّل") }}
        />
      </section>

      {takes.length ? (
        <section className="rounded-[28px] bg-white pb-1.5 pt-[18px] md:pt-6">
          <h2 className="px-[18px] pb-2 font-display text-lg font-semibold md:px-6">{t("Full counts", "الجرد الكامل")}</h2>
          {takes.slice(0, 8).map((x) => (
            <div key={x.take_date} className="flex justify-between gap-3 border-t border-[#EDF0F3] px-[18px] py-2.5 text-sm md:px-6">
              <span>
                <span className="font-semibold">{shortDay(x.take_date)}</span> <span className="text-neutral-500">{timeOf(x.take_at)}</span>
              </span>
              <span className="text-right text-xs text-neutral-500">
                {t("shop", "المحل")} {x.shop_lines} · {t("store", "المخزن")} {x.store_lines}
                {x.shop_barista_id && staffName.get(x.shop_barista_id) ? ` · ${staffName.get(x.shop_barista_id)}` : ""}
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ReadyLine({ ok, title, detail, link }: { ok: boolean; title: string; detail: string | null; link: { href: string; label: string } | null }) {
  return (
    <div className="flex gap-3 border-t border-[#EEF1F4] py-3 first-of-type:mt-2">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${ok ? "bg-[#1E7A4C]" : "bg-strow-amber"}`}
      >
        {ok ? "✓" : "!"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {detail ? <p className="text-xs text-neutral-500">{detail}</p> : null}
        {link ? (
          <Link href={link.href as Route} className="text-xs font-semibold text-strow-blue">
            {link.label} ›
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function WasteItem({ r, ar }: { r: WasteRow; ar: boolean }) {
  const t = (en: string, arText: string) => (ar ? arText : en);
  const v = verdict(r);
  const tone = v === "over" ? "text-strow-amber" : v === "under" ? "text-strow-blue" : "text-[#1E7A4C]";
  const pct = r.should_use > 0 ? Math.round((r.unexplained / r.should_use) * 100) : null;
  const counted = (lines: WasteRow["detail"]["start"]) =>
    (lines ?? []).map((l) => `${l.place === "shop" ? t("shop", "المحل") : t("store", "المخزن")} ${l.qty ?? "–"} ${l.unit}`).join(" + ") || t("none", "لا شيء");
  return (
    <details className="group border-t border-[#EDF0F3] px-[18px] md:px-6">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 py-3">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">{r.name}</span>
          {r.members.length ? <span className="block text-xs text-neutral-400">{t("with", "مع")} {r.members.join(", ")}</span> : null}
          <span className="block text-xs text-neutral-500">
            {t("used", "استُخدم")} {fmtBase(r.used, r.base_uom)} · {t("recipes", "الوصفات")} {fmtBase(r.should_use, r.base_uom)}
            {r.logged_waste ? ` · ${t("thrown", "تالف")} ${fmtBase(r.logged_waste, r.base_uom)}` : ""}
          </span>
        </span>
        <span className={`shrink-0 text-right tabular-nums ${tone}`}>
          <span className="block text-[15px] font-semibold">{r.unexplained_cost !== null ? signedAed(r.unexplained_cost) : signed(r.unexplained, r.base_uom)}</span>
          <span className="block text-xs">
            {signed(r.unexplained, r.base_uom)}
            {pct !== null ? ` · ${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%` : ""}
          </span>
        </span>
      </summary>
      <div className="flex flex-col gap-1.5 pb-3 text-[13px]">
        {v === "under" ? (
          <p className="rounded-xl bg-[#EEF2FC] px-3 py-2 text-strow-blue">
            {t("Less went than the recipes say: the recipe may be too big, or a bill or a count is missing.", "استُخدم أقل مما تقول الوصفات: ربما الوصفة أكبر من الحقيقة، أو فاتورة أو عدّ ناقص.")}
          </p>
        ) : v === "over" ? (
          <p className="rounded-xl bg-[#FFF7E8] px-3 py-2 text-strow-amber">
            {t(
              "More went than the recipes and the throw-aways explain: over-pouring, spills, staff drinks not rung up, a recipe that is too small, or loss.",
              "استُخدم أكثر مما تبرره الوصفات والتالف: سكب زائد، انسكاب، مشروبات للموظفين بدون تسجيل، وصفة أصغر من الحقيقة، أو فقد.",
            )}
          </p>
        ) : null}
        <p>
          <span className="text-neutral-500">{t("Start", "البداية")}:</span> {fmtBase(r.opening ?? 0, r.base_uom)} <span className="text-neutral-400">({counted(r.detail.start)})</span>
        </p>
        <p>
          <span className="text-neutral-500">{t("Bought", "المشتريات")}:</span> {fmtBase(r.bought, r.base_uom)}
        </p>
        {(r.detail.bills ?? []).map((b, i) => (
          <p key={i} className="pl-3 text-xs text-neutral-500">
            {shortDay(b.date)} · {b.supplier ?? t("no vendor", "بدون مورد")} · {b.what ?? ""} · {fmtBase(b.qty, b.uom)}
          </p>
        ))}
        <p>
          <span className="text-neutral-500">{t("End", "النهاية")}:</span> {fmtBase(r.closing ?? 0, r.base_uom)} <span className="text-neutral-400">({counted(r.detail.end)})</span>
        </p>
        {(r.detail.thrown ?? []).length ? (
          <p>
            <span className="text-neutral-500">{t("Thrown away", "التالف")}:</span>{" "}
            {(r.detail.thrown ?? []).map((w) => `${shortDay(w.on)} ${w.qty} ${w.unit}${w.why ? ` (${w.why})` : ""}`).join(", ")}
          </p>
        ) : null}
        {r.unit_cost !== null ? (
          <p className="text-xs text-neutral-500">
            AED {r.unit_cost.toFixed(2)} / {r.base_uom} {t("before VAT", "قبل الضريبة")}
          </p>
        ) : null}
      </div>
    </details>
  );
}
