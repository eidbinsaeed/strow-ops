import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { BackButton } from "@/components/pulse/BackButton";
import { CostFixes } from "../RecipeFixes";
import { AddLineForm, DetailsEditor, LineRow, RecipePhoto } from "../RecipeEditor";
import {
  NON_INGREDIENT_KINDS,
  SECTION_SUGGESTIONS,
  aed,
  buildIssues,
  driveFileId,
  marginTone,
  normLine,
  normMenu,
  rt,
  type BaseUom,
  type ItemOption,
} from "@/lib/recipes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const locale = await getLocale();
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const db = createServiceClient();

  const [itemRes, costRes, linesRes, itemsRes, unitRes, sectionsRes] = await Promise.all([
    db.from("menu_items").select("id, name, section, price, method, is_active, source, photo_drive_url, pos_name, notes").eq("id", id).maybeSingle(),
    db.from("v_menu_item_costs").select("*").eq("menu_item_id", id).maybeSingle(),
    db.from("v_recipe_line_costs").select("*").eq("menu_item_id", id).order("position"),
    db.from("inventory_items").select("id, name, kind, unit, default_unit_size, default_size_uom, is_active").order("name"),
    db.from("v_item_unit_cost").select("inventory_item_id, base_uom"),
    db.from("menu_items").select("section"),
  ]);
  const item = itemRes.data as { id: string; name: string; section: string | null; price: number | null; method: string | null; is_active: boolean; source: string; photo_drive_url: string | null; pos_name: string | null; notes: string | null } | null;
  if (!item) notFound();

  const cost = costRes.data ? normMenu(costRes.data as Record<string, unknown>) : null;
  const lines = (linesRes.data ?? []).map((r) => normLine(r as Record<string, unknown>));
  const base = new Map(((unitRes.data ?? []) as { inventory_item_id: string; base_uom: string }[]).map((u) => [u.inventory_item_id, u.base_uom as BaseUom]));
  const allItems = ((itemsRes.data ?? []) as Record<string, unknown>[]).map((i) => ({
    id: String(i.id),
    name: String(i.name),
    kind: String(i.kind ?? "other"),
    unit: (i.unit as string | null) ?? null,
    base: base.get(String(i.id)) ?? null,
    packSize: i.default_unit_size != null ? Number(i.default_unit_size) : null,
    packUom: (i.default_size_uom as string | null) ?? null,
    active: i.is_active !== false,
  }));
  const pickable: ItemOption[] = allItems.filter((i) => i.active && !NON_INGREDIENT_KINDS.has(i.kind));
  const itemMap = new Map<string, ItemOption>(allItems.map((i) => [i.id, i]));
  const issues = buildIssues(lines, itemMap, new Map([[item.id, item.name]]));
  const sections = [...new Set([...((sectionsRes.data ?? []) as { section: string | null }[]).map((s) => s.section).filter((s): s is string => !!s), ...SECTION_SUGGESTIONS])];
  const fileId = driveFileId(item.photo_drive_url);
  const price = item.price != null ? Number(item.price) : null;
  const missing = cost ? cost.ingredient_count - cost.costed_count : 0;
  const steps = (item.method ?? "").split(/\n+/).map((s) => s.trim()).filter(Boolean);

  return (
    <div className="page flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col gap-1 px-1">
        <BackButton fallback="/owner/recipes?tab=cards" label={t("back")} className="-ms-1 self-start" />
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.6px]">{item.name}</h1>
        <p className="text-sm text-neutral-500">
          {item.section ?? t("no_section")}
          {!item.is_active ? ` · ${t("off_menu")}` : ""}
        </p>
        {item.source === "pos" && lines.length === 0 ? (
          <p className="mt-1 rounded-[18px] bg-[#E3EAFB] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#1A3FA8]">
            {locale === "ar"
              ? "أضيف تلقائياً من تقرير نقاط البيع. أضف مكوناته بالأسفل لترى التكلفة والهامش."
              : `${item.notes?.startsWith("Added automatically") ? item.notes.split(".")[0] : "Added automatically from a POS report"}. Add its ingredients below to see the cost and margin.`}
            {item.pos_name && item.pos_name !== item.name ? (locale === "ar" ? ` الاسم في نقاط البيع: ${item.pos_name}` : ` POS name: ${item.pos_name}`) : ""}
          </p>
        ) : null}
        {fileId ? <RecipePhoto fileId={fileId} name={item.name} /> : null}
      </div>

      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label={t("price_short")} value={price != null ? aed(price) : "—"} sub={cost?.price_ex_vat != null ? `${aed(cost.price_ex_vat)} ex VAT` : undefined} />
        <Stat label={t("cost")} value={cost && cost.ingredient_count > 0 ? aed(cost.cost) : "—"} sub={missing > 0 ? `${missing} ${t("missing")}` : undefined} warn={missing > 0} />
        <Stat label={t("profit")} value={cost?.profit != null ? aed(cost.profit) : "—"} />
        <div className="flex flex-col justify-center rounded-[24px] bg-white px-4 py-3.5">
          <span className="text-xs text-neutral-500">{t("margin")}</span>
          <span className={`mt-1 self-start rounded-full px-2.5 py-0.5 font-display text-2xl font-bold tabular-nums ${marginTone(cost?.margin_pct)}`}>
            {cost?.margin_pct != null ? `${Math.round(cost.margin_pct)}%` : "—"}
          </span>
        </div>
      </section>

      {issues.length ? <CostFixes issues={issues} items={pickable} compact /> : null}

      <section className="rounded-[28px] bg-white px-[18px] pb-4 pt-[18px] md:px-6 md:pt-6">
        <h2 className="pb-2 font-display text-lg font-semibold">{t("ingredients")}</h2>
        {lines.map((l) => (
          <LineRow key={l.id} line={l} items={pickable} />
        ))}
        <AddLineForm menuItemId={item.id} items={pickable} />
        <p className="mt-3 text-xs text-neutral-400">{t("before_vat")}</p>
      </section>

      {steps.length ? (
        <section className="rounded-[28px] bg-white px-[18px] py-5 md:p-6">
          <h2 className="pb-2 font-display text-lg font-semibold">{t("method")}</h2>
          <ol className="list-decimal space-y-1.5 ps-5 text-[15px] leading-relaxed">
            {steps.map((s, i) => (
              <li key={i} dir="auto">
                {s.replace(/^\d+[.)]\s*/, "")}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <DetailsEditor item={{ id: item.id, name: item.name, section: item.section, price, method: item.method, is_active: item.is_active }} sections={sections} />
    </div>
  );
}

function Stat({ label, value, sub, warn = false }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="flex flex-col rounded-[24px] bg-white px-4 py-3.5">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="mt-1 font-display text-xl font-bold tabular-nums tracking-tight">{value}</span>
      {sub ? <span className={`text-xs ${warn ? "text-amber-700" : "text-neutral-400"}`}>{sub}</span> : null}
    </div>
  );
}
