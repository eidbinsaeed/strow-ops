import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { getSettings } from "@/lib/settings";
import { shortDay, todayDubai } from "@/lib/dates";
import { daysOfCover, fmtQty, NO_SUPPLIER, storeCountDue, toLevel, WEEKDAYS_AR, WEEKDAYS_EN, type StockLevel } from "@/lib/stock";
import { loadRestock } from "@/lib/stock-plan";
import { StockSwitches } from "./StockSwitches";
import { CopyText } from "@/components/stock/CopyText";

export const dynamic = "force-dynamic";

const COVER_WINDOW = 14;
const SECTION = "rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]";

type CountRow = {
  id: string;
  place: "shop" | "store";
  counted_on: string;
  counted_at: string;
  notes: string | null;
  baristas: { name: string } | { name: string }[] | null;
};
type LineRow = { count_id: string; stock_item_id: string; qty: number | string; wasted: number | string | null; waste_reason: string | null };

const nameOf = (b: CountRow["baristas"]) => (Array.isArray(b) ? b[0]?.name : b?.name) ?? null;
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Dubai" });
const aed = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default async function OwnerStockPage() {
  const ar = (await getLocale()) === "ar";
  const t = (en: string, arText: string) => (ar ? arText : en);
  const db = createServiceClient();
  const today = todayDubai();
  const since = addDays(today, -COVER_WINDOW);
  const weekAgo = addDays(today, -6);

  const { data: loc } = await db.from("locations").select("id").eq("is_active", true).limit(1).maybeSingle();
  const locationId = (loc as { id: string } | null)?.id ?? "";
  const [settings, restock, countsRes, reportsRes] = await Promise.all([
    getSettings(),
    loadRestock(locationId, today).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
    db.from("stock_counts").select("id, place, counted_on, counted_at, notes, baristas(name)").order("counted_at", { ascending: false }).limit(14),
    db.from("pos_daily_reports").select("business_date").gt("business_date", since).lte("business_date", today),
  ]);

  const header = (
    <header className="px-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{t("Purchases", "المشتريات")}</p>
      <h1 className="font-display text-[28px] font-bold tracking-[-0.6px]">{t("Stock", "المخزون")}</h1>
      <p className="text-sm text-neutral-500">
        {t(
          "Staff count the shop every day and the store room once a week. Anything below its minimum is brought from the store room or goes on the order list.",
          "يعدّ الموظفون المحل يومياً والمخزن مرة في الأسبوع. ما ينزل عن الحد الأدنى يُنقل من المخزن أو يدخل قائمة الطلب.",
        )}
      </p>
    </header>
  );

  if ("error" in restock) {
    return (
      <div className="page flex flex-col gap-4 md:gap-5">
        {header}
        <p className="rounded-[28px] bg-[#FBE9E7] px-[18px] py-5 text-sm text-[#9A1B12] md:p-[22px]">
          {t("Stock tables are not in the database yet", "جداول المخزون غير موجودة في قاعدة البيانات بعد")} — 0021_stock_counts.sql. ({restock.error})
        </p>
      </div>
    );
  }

  const { levels, costs, plan, message } = restock;
  const invIds = [...new Set(levels.map((l) => l.inventory_item_id).filter(Boolean))] as string[];

  const usageRes = invIds.length
    ? await db.from("v_pos_ingredient_usage").select("inventory_item_id, ingredient, base_uom, qty_used").in("inventory_item_id", invIds).gt("business_date", since).lte("business_date", today)
    : { data: [] };
  const usageMap = new Map<string, { inventory_item_id: string; name: string; uom: string; used: number }>();
  for (const u of (usageRes.data ?? []) as { inventory_item_id: string; ingredient: string; base_uom: string; qty_used: number | string }[]) {
    const cur = usageMap.get(u.inventory_item_id) ?? { inventory_item_id: u.inventory_item_id, name: u.ingredient, uom: u.base_uom, used: 0 };
    cur.used += Number(u.qty_used) || 0;
    usageMap.set(u.inventory_item_id, cur);
  }
  const reportDays = new Set(((reportsRes.data ?? []) as { business_date: string }[]).map((r) => r.business_date)).size;
  const cover = daysOfCover(levels, [...usageMap.values()], reportDays);

  const counts = (countsRes.data ?? []) as CountRow[];
  const countIds = counts.map((c) => c.id);
  const linesRes = countIds.length
    ? await db.from("stock_count_lines").select("count_id, stock_item_id, qty, wasted, waste_reason").in("count_id", countIds)
    : { data: [] };
  const lines = (linesRes.data ?? []) as LineRow[];
  const itemById = new Map(levels.map((l) => [l.id, l]));
  // Items taken off a list still show in old counts.
  const missing = [...new Set(lines.map((l) => l.stock_item_id).filter((id) => !itemById.has(id)))];
  if (missing.length) {
    const { data } = await db.from("stock_items").select("*").in("id", missing);
    for (const r of (data ?? []) as Record<string, unknown>[]) itemById.set(String(r.id), toLevel(r));
  }

  const lastShop = counts.find((c) => c.place === "shop") ?? null;
  const lastStore = counts.find((c) => c.place === "store") ?? null;
  const shopToday = lastShop?.counted_on === today ? lastShop : null;
  const due = storeCountDue(lastStore?.counted_on ?? null, today, settings.storeCountDay);
  const linesOf = (id: string) => lines.filter((l) => l.count_id === id);
  const days = ar ? WEEKDAYS_AR : WEEKDAYS_EN;

  // Thrown away in the last 7 days.
  const recent = new Set(counts.filter((c) => c.counted_on >= weekAgo).map((c) => c.id));
  const wasteMap = new Map<string, { item: StockLevel; qty: number; reasons: Set<string>; cost: number | null }>();
  for (const l of lines) {
    if (!recent.has(l.count_id) || l.wasted === null) continue;
    const item = itemById.get(l.stock_item_id);
    if (!item) continue;
    const w = wasteMap.get(item.id) ?? { item, qty: 0, reasons: new Set<string>(), cost: 0 };
    w.qty += Number(l.wasted);
    if (l.waste_reason) w.reasons.add(l.waste_reason);
    wasteMap.set(item.id, w);
  }
  const waste = [...wasteMap.values()].map((w) => {
    const c = w.item.inventory_item_id ? costs.get(w.item.inventory_item_id)?.cost ?? null : null;
    return { ...w, cost: c !== null && w.item.base_per_unit ? Math.round(c * w.qty * w.item.base_per_unit * 100) / 100 : null };
  });
  const wasteTotal = waste.reduce((s, w) => s + (w.cost ?? 0), 0);

  const shopItems = levels.filter((l) => l.place === "shop").length;
  const storeItems = levels.filter((l) => l.place === "store").length;
  const neverCounted = !counts.length;
  // Added from scanned bills (migration 0022) and still without a minimum: counted, never ordered.
  const { count: fromBillsNoMin } = await db.from("stock_items").select("id", { count: "exact", head: true }).eq("is_active", true).eq("source", "bill").is("min_qty", null);

  const reasonLabel: Record<string, string> = ar
    ? { expired: "منتهي", spoiled: "تالف", broken: "مكسور", other: "أخرى" }
    : { expired: "expired", spoiled: "spoiled", broken: "broken", other: "other" };

  return (
    <div className="page flex flex-col gap-4 md:gap-5">
      {header}

      <StockSwitches shop={settings.staffShopCount} store={settings.staffStoreCount} day={settings.storeCountDay} ar={ar} />

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <section className="rounded-[24px] bg-white p-4">
          <p className="text-xs text-neutral-500">{t("Shop count today", "عدّ المحل اليوم")}</p>
          <p className={`mt-1 text-[17px] font-semibold ${shopToday ? "" : "text-strow-amber"}`}>
            {shopToday ? `${t("Done", "تم")} ${timeOf(shopToday.counted_at)}` : t("Not yet", "لم يتم بعد")}
          </p>
          <p className="text-xs text-neutral-500">
            {shopToday
              ? `${nameOf(shopToday.baristas) ?? ""} · ${linesOf(shopToday.id).length} ${t("items", "صنف")}`
              : lastShop
                ? `${t("Last", "آخر عدّ")} ${shortDay(lastShop.counted_on)}`
                : settings.staffShopCount
                  ? t("No count yet", "لا يوجد عدّ بعد")
                  : t("Switched off", "مغلق")}
          </p>
        </section>
        <section className="rounded-[24px] bg-white p-4">
          <p className="text-xs text-neutral-500">{t("Store room count", "جرد المخزن")}</p>
          <p className="mt-1 text-[17px] font-semibold">{lastStore ? shortDay(lastStore.counted_on) : t("Never", "لم يتم")}</p>
          <p className={`text-xs ${due.state === "upcoming" ? "text-neutral-500" : "font-semibold text-strow-amber"}`}>
            {due.state === "upcoming"
              ? `${t("Next", "التالي")} ${shortDay(due.due)}`
              : due.state === "due"
                ? t("Due today", "مستحق اليوم")
                : `${t("Due since", "مستحق منذ")} ${shortDay(due.due)}`}
          </p>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="font-display text-xl font-bold">{t("Order list", "قائمة الطلب")}</h2>
          <span className="text-[13px] text-neutral-500">{t("from the latest counts", "من آخر عدّ")}</span>
        </div>

        {neverCounted ? (
          <p className={`${SECTION} text-sm text-neutral-500`}>{t("Nothing counted yet. Turn on the switches above and staff will see the lists.", "لا يوجد عدّ بعد. فعّل المفاتيح في الأعلى ليرى الموظفون القوائم.")}</p>
        ) : !plan.moves.length && !plan.orders.length ? (
          <p className={`${SECTION} text-sm text-neutral-500`}>{t("Nothing is below its minimum.", "لا شيء تحت الحد الأدنى.")}</p>
        ) : null}

        {plan.orders.map((g) => (
          <section key={g.supplier} className="rounded-[24px] bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className={`text-[15px] font-semibold ${g.supplier === NO_SUPPLIER ? "text-neutral-500" : ""}`}>{g.supplier === NO_SUPPLIER ? t("No usual supplier", "بدون مورد معتاد") : g.supplier}</h3>
              {g.total !== null && g.total > 0 ? (
                <span className="text-sm font-semibold tabular-nums" title={t("Last bill prices, before VAT", "آخر أسعار الفواتير، قبل الضريبة")}>
                  ≈ {aed(g.total)}
                </span>
              ) : null}
            </div>
            {g.lines.map((l) => (
              <div key={l.item.id} className="mt-2 border-t border-[#EEF1F4] pt-2">
                <div className="flex justify-between gap-3 text-sm">
                  <span>{l.item.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {fmtQty(l.qty)} {l.item.unit_label}
                  </span>
                </div>
                <p className="text-xs text-strow-amber">{l.why}</p>
              </div>
            ))}
          </section>
        ))}

        {plan.moves.length ? (
          <section className="rounded-[24px] border border-[#F1D9A8] bg-[#FFF7E8] p-4">
            <h3 className="text-[15px] font-semibold">{t("Bring from the store room", "انقل من المخزن إلى المحل")}</h3>
            {plan.moves.map((m) => (
              <p key={m.item.id} className="mt-1.5 text-sm">
                {m.item.name} · {fmtQty(m.bring)} {m.item.unit_label}{" "}
                <span className="text-neutral-500">
                  ({t("shop", "المحل")} {fmtQty(m.item.qty ?? 0)}, {t("minimum", "الحد الأدنى")} {fmtQty(m.item.min_qty ?? 0)};{" "}
                  {(m.from.some((f) => (f.qty ?? 0) > 0) ? m.from.filter((f) => (f.qty ?? 0) > 0) : m.from)
                    .map((f, _i, arr) =>
                      f.qty === null
                        ? `${t("store room not counted", "المخزن لم يُعدّ")}${arr.length > 1 ? ` (${f.name})` : ""}`
                        : `${t("store has", "في المخزن")} ${fmtQty(f.qty)} ${f.unit}${arr.length > 1 || m.from.length > 1 ? ` (${f.name})` : ""}`,
                    )
                    .join(", ")}
                  )
                </span>
              </p>
            ))}
          </section>
        ) : null}

        {plan.moves.length || plan.orders.length ? (
          <div className="grid grid-cols-2 gap-3">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center rounded-2xl bg-strow-blue px-4 text-[15px] font-semibold text-white transition active:scale-[0.98]"
            >
              {t("Send on WhatsApp", "إرسال عبر واتساب")}
            </a>
            <CopyText text={message} label={t("Copy list", "نسخ القائمة")} done={t("Copied ✓", "تم النسخ ✓")} />
          </div>
        ) : null}
      </section>

      <section className={SECTION}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t("Days of stock left", "أيام المخزون المتبقية")}</h2>
          <span className="text-xs text-neutral-500">{t("shop + store ÷ daily use", "المحل + المخزن ÷ الاستخدام اليومي")}</span>
        </div>
        {cover.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            {reportDays === 0
              ? t("Needs POS reports from the last two weeks.", "يحتاج تقارير نقاط البيع لآخر أسبوعين.")
              : t("Shows once items that the POS recipes use have been counted.", "يظهر بعد عدّ الأصناف التي تستخدمها الوصفات.")}
          </p>
        ) : (
          <div className="mt-2">
            {cover.map((c) => {
              const tone = c.days < 7 ? "#B26B00" : c.days < 14 ? "#2350D0" : "#1E7A4C";
              return (
                <div key={c.inventory_item_id} className="border-t border-[#EEF1F4] py-2.5 first:border-t-0">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-semibold">{c.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums" style={{ color: tone }}>
                      {c.days < 1 ? t("under 1 day", "أقل من يوم") : `${Math.round(c.days)} ${t("days", "يوم")}`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-[#E9ECF0]">
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, Math.max(3, (c.days / 30) * 100))}%`, background: tone }} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {fmtQty(c.onHand)} {c.uom} {t("on hand", "متوفر")} · {t("uses", "يُستهلك")} {fmtQty(Math.round(c.perDay * 100) / 100)} {c.uom} {t("a day", "يومياً")} · {c.detail}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          {t(
            `Daily use = POS sales × recipes over the last ${reportDays} report days. Bars are out of 30 days.`,
            `الاستخدام اليومي = مبيعات نقاط البيع × الوصفات خلال آخر ${reportDays} يوم بتقارير. الأشرطة من 30 يوماً.`,
          )}
        </p>
      </section>

      <section className={SECTION}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t("Thrown away this week", "التالف هذا الأسبوع")}</h2>
          {wasteTotal > 0 ? <span className="text-sm font-semibold tabular-nums">≈ {aed(wasteTotal)}</span> : null}
        </div>
        {waste.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">{t("Nothing logged in the last 7 days.", "لم يُسجّل شيء خلال آخر 7 أيام.")}</p>
        ) : (
          waste.map((w) => (
            <div key={w.item.id} className="flex justify-between gap-3 border-t border-[#EEF1F4] py-2 text-sm first:mt-2 first:border-t-0">
              <span>
                {w.item.name} <span className="text-neutral-500">· {[...w.reasons].map((r) => reasonLabel[r] ?? r).join(", ")}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {fmtQty(w.qty)} {w.item.unit_label}
                {w.cost ? <span className="text-neutral-500"> · {aed(w.cost)}</span> : null}
              </span>
            </div>
          ))
        )}
      </section>

      <section className="rounded-[28px] bg-white pb-1.5 pt-[18px] md:pt-6">
        <h2 className="px-[18px] pb-2 font-display text-lg font-semibold md:px-6">{t("Recent counts", "آخر عمليات العدّ")}</h2>
        {counts.length === 0 ? (
          <p className="border-t border-[#EDF0F3] px-[18px] py-5 text-sm text-neutral-500 md:px-6">{t("No counts yet.", "لا يوجد عدّ بعد.")}</p>
        ) : (
          counts.map((c) => {
            const ls = linesOf(c.id)
              .map((l) => ({ l, item: itemById.get(l.stock_item_id) }))
              .filter((x) => x.item)
              .sort((a, b) => (a.item?.sort ?? 0) - (b.item?.sort ?? 0));
            const lowN = ls.filter(({ l, item }) => item?.min_qty !== null && item?.min_qty !== undefined && Number(l.qty) < item.min_qty).length;
            return (
              <details key={c.id} className="group border-t border-[#EDF0F3] px-[18px] md:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">
                      {c.place === "shop" ? t("Shop", "المحل") : t("Store room", "المخزن")} · {shortDay(c.counted_on)} {timeOf(c.counted_at)}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {nameOf(c.baristas) ?? t("Unknown", "غير معروف")} · {ls.length} {t("items", "صنف")}
                      {lowN ? <span className="font-semibold text-strow-amber"> · {lowN} {t("low", "منخفض")}</span> : null}
                    </span>
                  </span>
                  <span className="text-neutral-400 transition group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                </summary>
                <div className="pb-3">
                  {c.notes ? <p className="mb-2 rounded-xl bg-[#F4F6F8] px-3 py-2 text-[13px]">{c.notes}</p> : null}
                  {ls.map(({ l, item }) => {
                    const low = item?.min_qty !== null && item?.min_qty !== undefined && Number(l.qty) < item.min_qty;
                    return (
                      <div key={l.stock_item_id} className="flex justify-between gap-3 py-1 text-[13px]">
                        <span className={item?.place && !levels.some((x) => x.id === item.id) ? "text-neutral-400 line-through" : ""}>{item?.name}</span>
                        <span className={`shrink-0 tabular-nums ${low ? "font-semibold text-strow-amber" : ""}`}>
                          {fmtQty(Number(l.qty))} {item?.unit_label}
                          {l.wasted !== null ? (
                            <span className="text-neutral-500">
                              {" "}
                              · {t("thrown", "تالف")} {fmtQty(Number(l.wasted))}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })
        )}
      </section>

      <Link href={"/owner/stock/lists" as Route} className="flex items-center justify-between gap-3 rounded-[24px] bg-white p-4 text-strow-ink">
        <span>
          <span className="block text-[15px] font-semibold">{t("Count lists & minimums", "قوائم العدّ والحد الأدنى")}</span>
          <span className="block text-xs text-neutral-500">
            {shopItems} {t("shop items", "صنف في المحل")} · {storeItems} {t("store items", "صنف في المخزن")} · {t("store count every", "جرد المخزن كل")} {days[settings.storeCountDay]}
          </span>
          {fromBillsNoMin ? (
            <span className="mt-1 block text-xs font-semibold text-strow-amber">
              {fromBillsNoMin} {t("items added from bills have no minimum yet", "صنفاً أُضيفت من الفواتير وبلا حد أدنى بعد")}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="text-xl text-neutral-400">
          ›
        </span>
      </Link>
    </div>
  );
}
