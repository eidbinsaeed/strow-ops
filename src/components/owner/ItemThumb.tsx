import { supplierIcon } from "@/lib/supplier-icon";

/** Words that pick the right fallback icon for an item kind. */
const KIND_WORD: Record<string, string> = {
  dairy: "dairy", plant_milk: "milk", coffee: "coffee", bakery: "bakery", produce: "fruit", frozen_fruit: "fruit",
  packaging: "pack", cleaning: "clean", base: "sweet", pantry: "market", beverage: "market", food: "kitchen", ingredient: "market",
};

/**
 * A stock item's photo in a rounded tile — its real photo when it has one (from the web or added
 * by hand), else an icon for its kind. Decorative: the item's name is always written next to it.
 */
export function ItemThumb({
  id,
  name,
  kind,
  photoPath,
  version,
  size = 44,
}: {
  id?: string | null;
  name?: string | null;
  kind?: string | null;
  photoPath?: string | null;
  version?: string | null;
  size?: number;
}) {
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.26) };
  if (id && photoPath) {
    return (
      <span aria-hidden className="flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-black/[0.07]" style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/item-photo/${id}?v=${encodeURIComponent(version ?? "1")}`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </span>
    );
  }
  const ic = supplierIcon(name, KIND_WORD[kind ?? ""] ?? kind ?? null);
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center" style={{ ...box, background: ic.tint, color: ic.color }}>
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d={ic.path} />
      </svg>
    </span>
  );
}
