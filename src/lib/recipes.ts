/**
 * Recipes — shared types, units and labels (safe in server and client code).
 *
 * A recipe line is an amount of an inventory item in g, ml, pcs, kg or L.
 * Cost is NOT computed here: the database views do it (migration 0018):
 *   v_item_unit_cost     latest purchase price per kg / L / pc (before VAT)
 *   v_recipe_line_costs  qty × that price, or the owner's manual price
 *   v_menu_item_costs    cost, profit and margin per menu item
 * so the page, Strow AI and (later) POS consumption all read the same numbers.
 */
import type { Locale } from "@/lib/i18n/dict";

export const RECIPE_UOMS = ["g", "ml", "pcs", "kg", "L"] as const;
export type RecipeUom = (typeof RECIPE_UOMS)[number];
export type BaseUom = "kg" | "L" | "pcs";
export type Conf = "high" | "medium" | "low";
export type CostSource = "purchase" | "manual" | "no_item" | "no_price" | "unit_mismatch";
export type RecipeSource = "photo" | "text" | "manual";

export function normUom(u: unknown): RecipeUom | null {
  const k = String(u ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (["g", "gm", "gr", "gram", "grams"].includes(k)) return "g";
  if (k === "ml") return "ml";
  if (["pcs", "pc", "piece", "pieces", "unit", "units"].includes(k)) return "pcs";
  if (k === "kg" || k === "kgs") return "kg";
  if (["l", "lt", "ltr", "litre", "liter"].includes(k)) return "L";
  return null;
}

export function baseOfUom(u: RecipeUom): BaseUom {
  return u === "g" || u === "kg" ? "kg" : u === "ml" || u === "L" ? "L" : "pcs";
}

/** The unit a recipe normally uses for an item bought per kg / L / pc. */
export function recipeUomFor(base: string | null | undefined): RecipeUom {
  return base === "kg" ? "g" : base === "L" ? "ml" : "pcs";
}

/** Recipe units that measure the same thing as a purchase base. */
export function uomsForBase(base: BaseUom): RecipeUom[] {
  return base === "kg" ? ["g", "kg"] : base === "L" ? ["ml", "L"] : ["pcs"];
}

export type PackGuess = { size: number; uom: "g" | "kg" | "ml" | "L" };

/**
 * Pack size written in an item's name or unit, for the one-tap fix:
 * "Acai Puree — Montone 3.2kg" → 3.2 kg, "(12×1L case)" → 12 L, "1 Gallon" → 3.785 L.
 * Cup sizes in oz are capacities, not contents — never matched.
 */
export function guessPackSize(...texts: (string | null | undefined)[]): PackGuess | null {
  const unit = (u: string): PackGuess["uom"] | null => {
    const k = u.toLowerCase();
    if (k === "kg" || k === "kgs") return "kg";
    if (k === "g" || k === "gm" || k === "gr") return "g";
    if (k === "ml") return "ml";
    if (["l", "lt", "ltr", "litre", "liter"].includes(k)) return "L";
    return null;
  };
  const n = (s: string) => parseFloat(s.replace(",", "."));
  for (const t of texts) {
    if (!t) continue;
    const multi = t.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|kgs|g|gm|gr|ml|l|lt|ltr|litre|liter)\b/i);
    if (multi && /case|ctn|carton|box|pack|pk/i.test(t)) {
      const u = unit(multi[3]);
      if (u) return { size: Math.round(n(multi[1]) * n(multi[2]) * 1000) / 1000, uom: u };
    }
    const one = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|g|gm|gr|ml|l|lt|ltr|litre|liter)\b/i);
    if (one) {
      const u = unit(one[2]);
      if (u && n(one[1]) > 0) return { size: n(one[1]), uom: u };
    }
    if (/\bgallon\b|\bgal\b/i.test(t)) return { size: 3.785, uom: "L" };
  }
  return null;
}

/** Drive "…/file/d/<id>/view" → "<id>" (photos are served through /api/bill-photo/<id>). */
export function driveFileId(url: string | null | undefined): string | null {
  const m = (url ?? "").match(/\/file\/d\/([A-Za-z0-9_-]{10,200})/);
  return m ? m[1] : null;
}

export function aed(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "";
  return Number(n).toLocaleString("en-AE", { maximumFractionDigits: 3 });
}

/** Coffee-shop rule of thumb: drink cost ≤ 30% of price is healthy. */
export function marginTone(pct: number | null | undefined): string {
  if (pct == null) return "bg-neutral-100 text-neutral-500";
  if (pct >= 70) return "bg-emerald-50 text-emerald-700";
  if (pct >= 60) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

export const KIND_LABEL: Record<string, { en: string; ar: string }> = {
  coffee: { en: "Coffee", ar: "قهوة" },
  dairy: { en: "Dairy", ar: "ألبان" },
  plant_milk: { en: "Plant milk", ar: "حليب نباتي" },
  base: { en: "Bases & purees", ar: "قواعد ومهروس" },
  produce: { en: "Produce", ar: "فواكه وخضار" },
  frozen_fruit: { en: "Frozen fruit", ar: "فواكه مجمدة" },
  pantry: { en: "Pantry", ar: "مواد جافة" },
  bakery: { en: "Bakery", ar: "مخبوزات" },
  beverage: { en: "Beverages", ar: "مشروبات" },
  packaging: { en: "Packaging", ar: "تغليف" },
  other: { en: "Other", ar: "أخرى" },
};
export const KIND_ORDER = ["coffee", "dairy", "plant_milk", "base", "produce", "frozen_fruit", "pantry", "bakery", "beverage", "packaging", "other"];
/** Never ingredients — hidden from the recipe item picker. */
export const NON_INGREDIENT_KINDS = new Set(["service", "cleaning"]);

export const SECTION_SUGGESTIONS = ["Hot coffee", "Iced coffee", "V60", "Matcha", "Tea", "Smoothies", "Bowls", "Desserts", "Bakery", "Other"];

/** An inventory item as the recipe screens need it. */
export type ItemOption = {
  id: string;
  name: string;
  kind: string;
  unit: string | null;
  /** Purchase base unit from the latest bill: kg, L or pcs (null = never bought). */
  base: BaseUom | null;
  packSize: number | null;
  packUom: string | null;
};

/** What the AI reader returns per recipe (after server-side checks). */
export type ExtractedLine = {
  as_written: string | null;
  name: string;
  inventory_item_id: string | null;
  qty: number | null;
  uom: RecipeUom | null;
  converted_from: string | null;
  free: boolean;
  confidence: Conf;
};
export type ExtractedRecipe = {
  name: string;
  name_as_written: string | null;
  section: string | null;
  price: number | null;
  method: string | null;
  confidence: Conf;
  existing_id: string | null;
  lines: ExtractedLine[];
};
export type ExtractResponse =
  | { ok: true; recipes: ExtractedRecipe[]; note: string | null; photo: { url: string; path: string } | null }
  | { ok: false; error: string };

/** One recipe as the review screen sends it to saveRecipes (re-validated on the server). */
export type RecipeSaveInput = {
  key: string;
  name: string;
  section: string | null;
  price: number | null;
  method: string | null;
  source: RecipeSource;
  photo_drive_url: string | null;
  photo_drive_path: string | null;
  lines: {
    inventory_item_id: string | null;
    label: string | null;
    as_written: string | null;
    qty: number;
    uom: RecipeUom;
    free: boolean;
  }[];
};

// ─── Labels (English / Arabic) ───────────────────────────────────────────────
const L = {
  title: ["Recipes", "الوصفات"],
  subtitle_none: ["Add your recipes — snap the handwritten cards and Strow reads them.", "أضف وصفاتك — صوّر البطاقات المكتوبة بخط اليد وسيقرأها Strow."],
  recipes: ["recipes", "وصفات"],
  avg_margin: ["avg margin", "متوسط الهامش"],
  add_recipes: ["Add recipes", "إضافة وصفات"],
  tab_photo: ["Photo", "صورة"],
  tab_text: ["Type", "كتابة"],
  tab_manual: ["Manual", "يدوي"],
  take_photo: ["Take photo", "التقط صورة"],
  from_gallery: ["From gallery", "من المعرض"],
  photo_hint: ["One card or a full notebook page — several recipes per photo is fine. Hold it flat and well lit.", "بطاقة واحدة أو صفحة كاملة — عدة وصفات في صورة واحدة لا بأس. صوّرها مستوية وبإضاءة جيدة."],
  text_hint: ["Type or paste recipes in any style, English or Arabic.", "اكتب أو الصق الوصفات بأي طريقة، بالعربي أو الإنجليزي."],
  text_placeholder: [
    "Spanish Latte 12oz: 18g espresso, 150ml milk, 30ml condensed milk, ice\nIced Matcha: 3g matcha, 200ml oat milk, 2 pumps vanilla",
    "سبانش لاتيه 12 أونصة: 18 جم إسبريسو، 150 مل حليب، 30 مل حليب مكثف، ثلج",
  ],
  read_with_ai: ["Read with AI", "اقرأ بالذكاء الاصطناعي"],
  manual_hint: ["Start an empty recipe and fill it in.", "ابدأ وصفة فارغة واملأها."],
  new_recipe: ["New recipe", "وصفة جديدة"],
  reading: ["Reading your recipes…", "جاري قراءة الوصفات…"],
  review: ["Check before saving", "راجع قبل الحفظ"],
  review_hint: ["Amber = AI unsure or converted a unit. Fix anything off, then save.", "البرتقالي = غير متأكد أو حوّل وحدة. صحّح أي خطأ ثم احفظ."],
  name: ["Name", "الاسم"],
  section: ["Section", "القسم"],
  price: ["Menu price (incl. VAT)", "سعر القائمة (شامل الضريبة)"],
  method: ["Method", "طريقة التحضير"],
  ingredients: ["Ingredients", "المكونات"],
  ingredient: ["Ingredient", "المكوّن"],
  not_in_stock: ["— Not in stock list —", "— غير موجود في قائمة الأصناف —"],
  label_ph: ["Ingredient name", "اسم المكوّن"],
  qty: ["Qty", "الكمية"],
  free: ["No cost (ice, water)", "بدون تكلفة (ثلج، ماء)"],
  add_ingredient: ["+ Ingredient", "+ مكوّن"],
  save: ["Save recipe", "احفظ الوصفة"],
  save_all: ["Save all", "احفظ الكل"],
  saving: ["Saving…", "جاري الحفظ…"],
  saved: ["Saved", "تم الحفظ"],
  open: ["Open", "افتح"],
  discard: ["Discard", "تجاهل"],
  updates_existing: ["Replaces existing recipe", "سيستبدل وصفة موجودة"],
  written: ["Written", "مكتوب"],
  photo: ["Photo", "الصورة"],
  bought_per: ["bought per", "يُشترى لكل"],
  never_bought: ["no bill yet", "لا توجد فاتورة"],
  cost: ["Cost", "التكلفة"],
  profit: ["Profit", "الربح"],
  margin: ["Margin", "الهامش"],
  price_short: ["Price", "السعر"],
  before_vat: ["Before VAT on both sides · cost from your latest bills.", "قبل الضريبة للطرفين · التكلفة من آخر فواتيرك."],
  missing: ["no price", "بدون سعر"],
  off_menu: ["Off the menu", "خارج القائمة"],
  no_section: ["Other", "أخرى"],
  fix_prices: ["Finish the costs", "أكمل التكاليف"],
  fix_hint: ["Fix an ingredient once — every recipe using it updates.", "صحّح المكوّن مرة واحدة — تتحدث كل الوصفات التي تستخدمه."],
  used_in: ["Used in", "مستخدم في"],
  pack_q: ["Bought per piece. How much is in one?", "يُشترى بالقطعة. كم يحتوي الواحد؟"],
  per_piece_q: ["Bought by", "يُشترى بـ"],
  per_piece_q2: ["One piece is about", "القطعة الواحدة تقريباً"],
  swap_q: ["Bought by", "يُشترى بـ"],
  swap_btn: ["Switch recipes to", "حوّل الوصفات إلى"],
  no_price_q: ["No bill for this item yet. Price per", "لا توجد فاتورة لهذا الصنف. السعر لكل"],
  no_item_q: ["Not linked to your stock list.", "غير مرتبط بقائمة الأصناف."],
  link_to: ["Link to item", "اربط بصنف"],
  or_price: ["or price per", "أو السعر لكل"],
  set: ["Save", "حفظ"],
  edit: ["Edit", "تعديل"],
  remove: ["Remove", "حذف"],
  cancel: ["Cancel", "إلغاء"],
  delete_recipe: ["Delete recipe", "حذف الوصفة"],
  confirm_delete: ["Delete this recipe? This can't be undone.", "حذف هذه الوصفة؟ لا يمكن التراجع."],
  confirm_remove_line: ["Remove this ingredient?", "حذف هذا المكوّن؟"],
  details: ["Details", "التفاصيل"],
  on_menu: ["On the menu", "في القائمة"],
  back: ["Recipes", "الوصفات"],
  up: ["up", "ارتفع"],
  down: ["down", "انخفض"],
  vs_before: ["vs previous bill", "عن الفاتورة السابقة"],
  manual_price: ["your price", "سعرك"],
  empty: ["No recipes yet. Snap your first recipe card above.", "لا توجد وصفات بعد. صوّر أول بطاقة وصفة بالأعلى."],
  nothing_found: ["No recipes found in that. Try a clearer photo, or type it.", "لم أجد وصفات. جرّب صورة أوضح أو اكتبها."],
  needs_price: ["need a price", "تحتاج سعراً"],
  all_costed: ["All ingredients priced", "كل المكونات مسعّرة"],
  ai_note: ["AI note", "ملاحظة"],
  view_photo: ["View recipe photo", "عرض صورة الوصفة"],
  add: ["Add", "إضافة"],
} as const;

export type RtKey = keyof typeof L;
export function rt(key: RtKey, locale: Locale): string {
  return L[key][locale === "ar" ? 1 : 0];
}

// ─── Live cost rows (v_recipe_line_costs) and what still needs a price ───────

export type LineCostRow = {
  id: string;
  menu_item_id: string;
  position: number;
  inventory_item_id: string | null;
  ingredient: string;
  label: string | null;
  as_written: string | null;
  qty: number;
  uom: string;
  base_uom: string;
  cost_uom: string | null;
  purchase_unit_cost: number | null;
  prev_unit_cost: number | null;
  last_bought: string | null;
  supplier_name: string | null;
  manual_unit_cost: number | null;
  cost_source: CostSource;
  line_cost: number | null;
};

export type MenuCostRow = {
  menu_item_id: string;
  name: string;
  section: string | null;
  price: number | null;
  is_active: boolean;
  ingredient_count: number;
  costed_count: number;
  cost: number;
  price_ex_vat: number | null;
  profit: number | null;
  margin_pct: number | null;
};

/** One ingredient that blocks a cost — fixed once, every recipe using it updates. */
export type CostIssue =
  | { kind: "pack"; key: string; itemId: string; name: string; guess: PackGuess | null; usedIn: string[] }
  | { kind: "per_piece"; key: string; itemId: string; name: string; costBase: "kg" | "L"; usedIn: string[] }
  | { kind: "swap"; key: string; itemId: string; name: string; costBase: "kg" | "L"; usedIn: string[] }
  | { kind: "no_price"; key: string; itemId: string; name: string; bases: BaseUom[]; usedIn: string[] }
  | { kind: "no_item"; key: string; label: string; bases: BaseUom[]; usedIn: string[] };

const toNum = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

/** PostgREST returns numerics as numbers or strings depending on size — normalise. */
export function normLine(r: Record<string, unknown>): LineCostRow {
  return {
    ...(r as unknown as LineCostRow),
    qty: Number(r.qty),
    position: Number(r.position ?? 0),
    purchase_unit_cost: toNum(r.purchase_unit_cost),
    prev_unit_cost: toNum(r.prev_unit_cost),
    manual_unit_cost: toNum(r.manual_unit_cost),
    line_cost: toNum(r.line_cost),
  };
}
export function normMenu(r: Record<string, unknown>): MenuCostRow {
  return {
    ...(r as unknown as MenuCostRow),
    price: toNum(r.price),
    cost: Number(r.cost ?? 0),
    price_ex_vat: toNum(r.price_ex_vat),
    profit: toNum(r.profit),
    margin_pct: toNum(r.margin_pct),
    ingredient_count: Number(r.ingredient_count ?? 0),
    costed_count: Number(r.costed_count ?? 0),
  };
}

export function buildIssues(lines: LineCostRow[], items: Map<string, ItemOption>, menuName: Map<string, string>): CostIssue[] {
  const out = new Map<string, CostIssue>();
  const isBase = (b: string): b is BaseUom => b === "kg" || b === "L" || b === "pcs";
  for (const l of lines) {
    if (l.line_cost != null) continue;
    const used = menuName.get(l.menu_item_id) ?? "";
    const item = l.inventory_item_id ? items.get(l.inventory_item_id) : undefined;
    let issue: CostIssue | null = null;
    if (l.cost_source === "no_item") {
      const label = (l.label ?? l.ingredient ?? "").trim();
      issue = { kind: "no_item", key: `label:${label.toLowerCase()}`, label, bases: [], usedIn: [] };
    } else if (l.cost_source === "no_price" && l.inventory_item_id) {
      issue = { kind: "no_price", key: `np:${l.inventory_item_id}`, itemId: l.inventory_item_id, name: l.ingredient, bases: [], usedIn: [] };
    } else if (l.cost_source === "unit_mismatch" && l.inventory_item_id) {
      const id = l.inventory_item_id;
      if (l.cost_uom === "pcs") {
        issue = { kind: "pack", key: `pack:${id}`, itemId: id, name: l.ingredient, guess: guessPackSize(item?.name ?? l.ingredient, item?.unit), usedIn: [] };
      } else if ((l.cost_uom === "kg" || l.cost_uom === "L") && l.base_uom === "pcs") {
        issue = { kind: "per_piece", key: `pp:${id}`, itemId: id, name: l.ingredient, costBase: l.cost_uom, usedIn: [] };
      } else if (l.cost_uom === "kg" || l.cost_uom === "L") {
        issue = { kind: "swap", key: `sw:${id}`, itemId: id, name: l.ingredient, costBase: l.cost_uom, usedIn: [] };
      }
    }
    if (!issue) continue;
    const cur = out.get(issue.key) ?? issue;
    if (used && !cur.usedIn.includes(used)) cur.usedIn.push(used);
    if ((cur.kind === "no_item" || cur.kind === "no_price") && isBase(l.base_uom) && !cur.bases.includes(l.base_uom)) cur.bases.push(l.base_uom);
    out.set(cur.key, cur);
  }
  return [...out.values()].sort((a, b) => b.usedIn.length - a.usedIn.length);
}
