import { supplierIcon } from "@/lib/supplier-icon";

/**
 * A supplier's logo in a rounded tile — its real logo when it has one (cut
 * from its bill or uploaded), else a category icon picked from its name.
 * Decorative: the supplier's name is always written next to it.
 */
export function SupplierLogo({
  id,
  name,
  category,
  logoPath,
  version,
  size = 40,
}: {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  logoPath?: string | null;
  version?: string | null;
  size?: number;
}) {
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.28) };
  if (id && logoPath) {
    return (
      <span aria-hidden className="flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-black/[0.07]" style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/supplier-logo/${id}?v=${encodeURIComponent(version ?? "1")}`} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-[3px]" />
      </span>
    );
  }
  const ic = supplierIcon(name, category);
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center" style={{ ...box, background: ic.tint, color: ic.color }}>
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d={ic.path} />
      </svg>
    </span>
  );
}
