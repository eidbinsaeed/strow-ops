/**
 * Small building blocks for the Apple look: large titles, grouped lists with
 * coloured icon squares, and tiles. Plain components (no hooks), so server
 * pages can use them directly.
 */
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { ICON, type IconName } from "@/lib/sections";

export function Icon({ name, size = 18, stroke = 2, className = "" }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

export function RowIcon({ name, color, size = 30 }: { name: IconName; color: string; size?: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center text-white" style={{ width: size, height: size, borderRadius: Math.round(size * 0.27), background: color }}>
      <Icon name={name} size={Math.round(size * 0.55)} stroke={2.2} />
    </span>
  );
}

export function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="#C4C4C7" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 rtl:-scale-x-100" aria-hidden>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function LargeTitle({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 pb-1 pt-1.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="text-[34px] font-bold leading-[41px] tracking-[0.01em]">{title}</h1>
        {subtitle ? <span className="text-[15px] leading-5 text-neutral-500">{subtitle}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** A section: small grey heading (hub pages) or a bold one with an optional right-hand link (Today). */
export function Group({
  title,
  big = false,
  aside,
  children,
  className = "",
}: {
  title?: string;
  big?: boolean;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section data-reveal="" className={`flex flex-col ${className}`}>
      {title ? (
        <div className={`flex items-center justify-between gap-3 ${big ? "px-1 pb-2 pt-1" : "px-4 pb-2"}`}>
          <h2 className={big ? "text-[20px] font-bold leading-[25px]" : "text-[15px] font-semibold leading-5 text-neutral-500"}>{title}</h2>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <div className="apple-rows overflow-hidden rounded-3xl bg-white">{children}</div>;
}

export function Row({
  href,
  icon,
  color,
  label,
  sub,
  detail,
  tone,
  flipId,
  wrap = false,
}: {
  flipId?: string;
  /** Let the label and sub line wrap instead of cutting them off. */
  wrap?: boolean;
  href: string;
  icon: IconName;
  color: string;
  label: ReactNode;
  sub?: ReactNode;
  detail?: ReactNode;
  tone?: "warn";
}) {
  return (
    <Link href={href as Route} data-flip-id={flipId} className="apple-row flex items-center gap-3 ps-4 text-strow-ink transition-colors active:bg-neutral-100">
      <RowIcon name={icon} color={color} />
      <span className="apple-row-body flex min-h-[52px] min-w-0 flex-1 items-center gap-2 py-2 pe-3.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`${wrap ? "" : "truncate "}text-[17px] leading-[22px]`}>{label}</span>
          {sub ? <span className={`${wrap ? "" : "truncate "}text-[15px] leading-5 text-neutral-500`}>{sub}</span> : null}
        </span>
        {detail != null ? <span className={`shrink-0 text-[15px] tabular-nums ${tone === "warn" ? "font-semibold text-strow-amber" : "text-neutral-500"}`}>{detail}</span> : null}
        <Chevron />
      </span>
    </Link>
  );
}

export function Tile({ label, value, unit, note, href, children }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; href?: string; children?: ReactNode }) {
  const body = (
    <>
      <span className="text-[15px] font-semibold text-neutral-500">{label}</span>
      <span className="mt-auto flex items-center justify-between gap-2">
        <span className="text-[30px] font-bold leading-9 tabular-nums">
          {value}
          {unit ? <span className="text-[15px] font-semibold text-neutral-500"> {unit}</span> : null}
        </span>
        {children}
      </span>
      {note ? <span className="truncate text-[13px] text-neutral-500">{note}</span> : null}
    </>
  );
  const cls = "flex min-h-[112px] flex-col gap-0.5 rounded-[22px] bg-white p-3.5";
  return href ? (
    <Link href={href as Route} className={`press ${cls}`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>
      {body}
    </div>
  );
}
