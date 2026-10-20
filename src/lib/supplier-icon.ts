/**
 * The icon shown in a supplier's logo slot until it has a real logo: picked
 * from the supplier's name and category (English or Arabic).
 */
export type SupplierIcon = { kind: string; path: string; color: string; tint: string };

const C = {
  blue: ["#2350D0", "#E3EAFB"],
  green: ["#0A6B34", "#E2F2E8"],
  teal: ["#0A6B78", "#E0F1F3"],
  brown: ["#7A5236", "#F2EAE3"],
  orange: ["#A65400", "#FBEBDC"],
  purple: ["#5B4BC4", "#ECE9FA"],
  slate: ["#47515E", "#EEF0F3"],
} as const;

const ICONS: { kind: string; words: RegExp; path: string; color: keyof typeof C }[] = [
  { kind: "dairy", words: /dairy|rawabi|milk|lacnor|al ain farms|حليب|ألبان|البان/i, path: "M9 2h6v3l2 3v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l2-3z M7 12h10", color: "blue" },
  { kind: "coffee", words: /roast|coffee|espresso|\bbeans?\b|قهوة|محمصة|مشروبات/i, path: "M15.5 3.5c3 1.8 3.8 6.6 1.7 10.6s-6.6 6.5-9.7 4.7-3.8-6.6-1.7-10.6 6.6-6.5 9.7-4.7z M15.5 3.5c-1.6 3.4-1.9 6.2-1 8.7s.6 5-1.7 6.6", color: "brown" },
  { kind: "dessert", words: /cake|marquise|crinkle|kurtos|sweet|cookie|choco|dessert|حلويات|كيك/i, path: "M3 20h18 M4 20v-7l16-4v11 M4 13l16-4 M8 8V5", color: "purple" },
  { kind: "bakery", words: /bak|bread|grain|flour|خبز|مخبز|حبوب/i, path: "M12 21V9 M12 9c-2-1-3-3-3-5 2 0 3 2 3 5z M12 9c2-1 3-3 3-5-2 0-3 2-3 5z M12 14c-2.5-.5-4-2.5-4-4.5 2.5 0 4 2 4 4.5z M12 14c2.5-.5 4-2.5 4-4.5-2.5 0-4 2-4 4.5z", color: "orange" },
  { kind: "packaging", words: /pack|dupak|cups?\b|carton|تغليف|أكواب/i, path: "M6 6h12l-1.5 14a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z M5 6l1-3h12l1 3 M8.5 11h7", color: "brown" },
  { kind: "delivery", words: /noon|blink|amazon\b|talabat|keeta|beanz|courier|delivery|mail|express couriers|توصيل/i, path: "M12 2.5l8.5 4.5v10L12 21.5 3.5 17V7z M3.5 7L12 11.5 20.5 7 M12 11.5v10", color: "orange" },
  { kind: "supermarket", words: /spinneys|carrefour|lulu|hyper|supermarket|market|mall|سوبر|هايبر|سوق/i, path: "M3 9h18l-2 11H5z M8 9l4-6 4 6 M9 13v4 M15 13v4", color: "teal" },
  { kind: "food-service", words: /restaurant|cafeteria|catering|kitchen|مطعم|كافتيريا/i, path: "M7 3v8a2 2 0 0 0 2 2v8 M5 3v6 M9 3v6 M16 21V3c2 1.5 3 4 3 7s-1 3-3 3", color: "orange" },
  { kind: "produce", words: /fresh|fruit|veg|farm|garden|خضار|فواكه|فاكهة/i, path: "M12 7c-1-2-3-3-5-2-3 1-3 6-1 10 1.5 3 3.5 4 6 3 2.5 1 4.5 0 6-3 2-4 2-9-1-10-2-1-4 0-5 2z M12 7c0-2 1-4 3-5", color: "green" },
  { kind: "pharmacy", words: /pharm|صيدلية/i, path: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z", color: "teal" },
  { kind: "cleaning", words: /clean|detergent|hygien|تنظيف|منظفات/i, path: "M9 3h5v4H9z M8 7h7l1 4v9a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-9z M14 3l4-1", color: "teal" },
  { kind: "books", words: /book|station|print|مكتبة|قرطاسية/i, path: "M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z", color: "purple" },
  { kind: "payments", words: /network|terminal|bank|visa|شبكة/i, path: "M3 6h18v12H3z M3 10h18 M7 15h4", color: "blue" },
];

const STORE = "M3 9l2-5h14l2 5 M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z M5 13v7h14v-7 M10 20v-4h4v4";

export function supplierIcon(name: string | null | undefined, category?: string | null): SupplierIcon {
  const text = `${name ?? ""} ${category ?? ""}`;
  const hit = ICONS.find((i) => i.words.test(text));
  const [color, tint] = C[hit?.color ?? "slate"];
  return { kind: hit?.kind ?? "store", path: hit?.path ?? STORE, color, tint };
}
