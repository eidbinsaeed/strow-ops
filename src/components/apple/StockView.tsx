import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import type { Locale } from "@/lib/i18n/dict";
import { COLOR } from "@/lib/sections";
import { Group, LargeTitle, Row, Rows } from "./ui";

export type PlaceCount = { last: string | null; low: number; items: number };
export type StockData = { shop: PlaceCount; store: PlaceCount; listItems: number; recipes: number; noRecipe: number; items: number; today: string };

function age(last: string | null, today: string, ar: boolean): string {
  if (!last) return ar ? "لم يُجرد بعد" : "Not counted yet";
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return ar ? "اليوم" : "Today";
  if (days === 1) return ar ? "أمس" : "Yesterday";
  if (days < 7) return ar ? `قبل ${days} أيام` : `${days} days old`;
  const d = new Date(`${last}T00:00:00Z`);
  return d.toLocaleDateString(ar ? "ar-AE" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function PlaceCard({ title, p, today, ar }: { title: string; p: PlaceCount; today: string; ar: boolean }) {
  return (
    <Link href="/owner/stock" className="press flex min-h-32 flex-col gap-0.5 rounded-[22px] bg-white p-3.5">
      <span className="text-[15px] font-semibold text-neutral-500">{title}</span>
      <span className="mt-auto text-[22px] font-bold leading-7">{age(p.last, today, ar)}</span>
      <span className={`text-[13px] font-semibold ${p.low ? "text-strow-amber" : "text-neutral-500"}`}>
        {p.last ? (p.low ? (ar ? `${p.low} ناقصة في آخر جرد` : `${p.low} low last time`) : ar ? "لا شيء ناقص" : "Nothing low") : `${p.items} ${ar ? "صنف في القائمة" : "items on the list"}`}
      </span>
      <span className="mt-1.5 text-[15px] font-semibold text-strow-blue">{ar ? "عرض الجرد" : "See the count"}</span>
    </Link>
  );
}

/** Stock: the two count lists at a glance, then stock and menu pages. */
export function StockView({ s, locale }: { s: StockData; locale: Locale }) {
  const ar = locale === "ar";
  return (
    <div className="page reveal-js">
      <Reveal className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <div data-reveal="">
          <LargeTitle title={ar ? "المخزون" : "Stock"} subtitle={ar ? `${s.listItems} صنف في قوائم الجرد` : `${s.listItems} items on the count lists`} />
        </div>
        <div data-reveal="" className="grid grid-cols-2 gap-3">
          <PlaceCard title={ar ? "المحل" : "Shop"} p={s.shop} today={s.today} ar={ar} />
          <PlaceCard title={ar ? "المخزن" : "Store room"} p={s.store} today={s.today} ar={ar} />
        </div>
        <Group title={ar ? "المخزون" : "Stock"}>
          <Rows>
            <Row href="/owner/stock" icon="box" color={COLOR.brown} label={ar ? "الجرد" : "Counts"} detail={ar ? "المحل، المخزن، الطلب" : "Shop, store room"} />
            <Row href="/owner/stock/lists" icon="list" color={COLOR.brown} label={ar ? "قوائم الجرد" : "Count lists"} detail={s.listItems} />
            <Row href="/owner/stock/waste" icon="trash" color={COLOR.brown} label={ar ? "فحص الهدر" : "Waste check"} />
          </Rows>
        </Group>
        <Group title={ar ? "القائمة" : "Menu"}>
          <Rows>
            <Row
              href="/owner/recipes"
              icon="cup"
              color={COLOR.green}
              label={ar ? "الوصفات" : "Recipes"}
              detail={s.noRecipe ? (ar ? `${s.noRecipe} بدون وصفة` : `${s.noRecipe} without a recipe`) : s.recipes}
              tone={s.noRecipe ? "warn" : undefined}
            />
            <Row href="/owner/items" icon="tag" color={COLOR.green} label={ar ? "الأصناف" : "Items"} detail={s.items} />
          </Rows>
        </Group>
      </Reveal>
    </div>
  );
}
