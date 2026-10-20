"use client";

/**
 * Home's period switch (Week · Month · Year): the sales card with a bar chart
 * you can tap or drag across, and the four tiles under it. Both read the
 * same choice, which is kept in a cookie so the page opens where you left it.
 */
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { CountUpText } from "@/components/ai/CountUp";
import { gsap, motion, reducedMotion, useGSAP } from "@/lib/motion";
import { PERIOD_KEYS, type PeriodKey } from "@/lib/home-period-keys";
import type { Period } from "@/lib/home-periods";
import { Tile } from "./ui";

motion();

const Ctx = createContext<{ key: PeriodKey; set: (k: PeriodKey) => void; periods: Record<PeriodKey, Period>; ar: boolean } | null>(null);
function usePeriod() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePeriod outside PeriodProvider");
  return c;
}

export function PeriodProvider({ periods, initial, ar, children }: { periods: Record<PeriodKey, Period>; initial: PeriodKey; ar: boolean; children: ReactNode }) {
  const [key, setKey] = useState<PeriodKey>(initial);
  const set = (k: PeriodKey) => {
    setKey(k);
    try {
      document.cookie = `home_period=${k}; path=/owner; max-age=31536000; samesite=lax`;
    } catch {
      /* cookies blocked: the choice just won't stick */
    }
  };
  return <Ctx.Provider value={{ key, set, periods, ar }}>{children}</Ctx.Provider>;
}

const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");

function Segmented() {
  const { key, set, periods } = usePeriod();
  const i = PERIOD_KEYS.indexOf(key);
  return (
    <div role="tablist" className="relative grid h-8 grid-cols-3 rounded-[9px] bg-[#7676801F] p-0.5">
      <span
        aria-hidden
        className="absolute inset-y-0.5 start-0.5 w-[calc((100%-4px)/3)] rounded-[7px] bg-white shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] transition-transform duration-300 ease-[cubic-bezier(0.3,0.9,0.3,1)] rtl:-scale-x-100"
        style={{ transform: `translateX(${i * 100}%)` }}
      />
      {PERIOD_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={k === key}
          onClick={() => set(k)}
          className={`relative z-[1] text-[13px] ${k === key ? "font-semibold" : "font-medium text-neutral-700"}`}
        >
          {periods[k].tab}
        </button>
      ))}
    </div>
  );
}

function Chart({ p, sel, onSel }: { p: Period; sel: number; onSel: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const H = 104;
  const max = Math.max(1, ...p.bars.map((b) => Math.max(b.value ?? 0, b.projected ?? 0)));
  const h = (v: number) => Math.max(4, Math.round((v / max) * H));
  const avgBottom = p.avg > 0 ? Math.round((p.avg / max) * H) : null;
  const gap = p.bars.length > 20 ? "gap-[3px]" : p.bars.length > 8 ? "gap-1.5" : "gap-2.5";
  const radius = p.bars.length > 20 ? 3 : 7;

  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap.fromTo(
        ref.current!.querySelectorAll("[data-bar]"),
        { scaleY: 0 },
        { scaleY: 1, transformOrigin: "50% 100%", duration: 0.6, ease: "power3.out", stagger: { amount: 0.3 }, clearProps: "transform" },
      );
    },
    { scope: ref, dependencies: [p.key] },
  );

  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let x = (clientX - r.left) / r.width;
    if (getComputedStyle(el).direction === "rtl") x = 1 - x;
    const i = Math.min(p.bars.length - 1, Math.max(0, Math.floor(x * p.bars.length)));
    if (p.bars[i].kind !== "future") onSel(i);
  };

  return (
    <div>
      <div
        ref={ref}
        className="relative mt-3 touch-pan-y select-none"
        style={{ height: H + 4 }}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => pick(e.clientX)}
      >
        <div className={`absolute inset-x-0 bottom-0 flex items-end ${gap}`} style={{ height: H }}>
          {p.bars.map((b, k) => {
            const on = k === sel;
            if (b.kind === "future") return <div key={b.key} className="h-1 flex-1 rounded-full bg-[#E5E5EA]" />;
            if (b.kind === "missing" || b.value == null)
              return <div key={b.key} data-bar="" className={`h-2 flex-1 border-[1.5px] border-dashed ${on ? "border-strow-blue" : "border-strow-amber"}`} style={{ borderRadius: radius }} />;
            return (
              <div key={b.key} className="relative flex-1" style={{ height: h(Math.max(b.value, b.projected ?? 0)) }}>
                {b.projected ? <div className="absolute inset-0 border-[1.5px] border-dashed border-[#8E8E93]" style={{ borderRadius: radius }} /> : null}
                <div
                  data-bar=""
                  className="absolute inset-x-0 bottom-0 transition-colors"
                  style={{ height: h(b.value), borderRadius: radius, background: on ? "#1E6EF4" : b.kind === "partial" ? "#9DBEF9" : "#D9D9DE" }}
                />
              </div>
            );
          })}
        </div>
        {avgBottom != null ? <div className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-[#8E8E93]" style={{ bottom: avgBottom }} /> : null}
      </div>
      <div aria-hidden className={`mt-1.5 flex ${gap} text-center text-[12px] text-neutral-500`}>
        {p.bars.map((b, k) => (
          <span key={b.key} className={`flex-1 overflow-visible whitespace-nowrap ${k === sel ? "font-bold text-strow-blue" : ""}`}>
            {b.axis}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The big card: total for the period, the change, and the chart. */
export function PeriodCard({ className = "" }: { className?: string }) {
  const { key, periods, ar } = usePeriod();
  const p = periods[key];
  const [selBy, setSelBy] = useState<Record<string, number>>({});
  const sel = selBy[key] ?? p.selected;
  const b = p.bars[sel];
  const selText = b ? (b.value == null ? (ar ? "لا يوجد إقفال" : "no close") : `AED ${fmt0(b.value)}`) : "";

  return (
    <section data-reveal="" className={`flex flex-col rounded-3xl bg-white px-4 pb-3.5 pt-3.5 ${className}`}>
      <Segmented />
      <div className="mt-3.5 flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold">{p.title}</span>
        <span className="text-[15px] text-neutral-500">{p.range}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[20px] font-semibold text-neutral-500">AED</span>
        <span className="text-[48px] font-bold leading-[1.1] tracking-[-1px] tabular-nums">
          <CountUpText key={key} text={fmt0(p.total)} from={0.6} duration={700} />
        </span>
      </div>
      {p.change ? (
        <span className={`mt-1.5 inline-flex h-7 items-center gap-1.5 self-start rounded-full px-[11px] text-[15px] font-semibold text-white ${p.change.pct >= 0 ? "bg-[#008932]" : "bg-[#C55300]"}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={p.change.pct >= 0 ? "" : "rotate-180"} aria-hidden>
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          {p.change.label}
        </span>
      ) : null}

      <div className="mt-3 flex min-h-5 items-baseline justify-between gap-2 text-[15px]" aria-live="polite">
        <span className="text-neutral-500">{b?.full}</span>
        <span className={`font-semibold tabular-nums ${b?.value == null ? "text-strow-amber" : "text-strow-blue"}`}>{selText}</span>
      </div>
      <div role="img" aria-label={p.bars.filter((x) => x.kind !== "future").map((x) => `${x.full} ${x.value == null ? (ar ? "ناقص" : "missing") : fmt0(x.value)}`).join(", ")}>
        <Chart p={p} sel={sel} onSel={(i) => setSelBy((s) => ({ ...s, [key]: i }))} />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-[#E5E5EA] pt-3">
        {p.left ? (
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 text-[13px] text-neutral-500">
              <span aria-hidden className="w-3.5 border-t-[1.5px] border-dashed border-[#8E8E93]" />
              {p.left.label}
            </span>
            <span className="text-[17px] font-semibold tabular-nums">{p.left.value}</span>
          </span>
        ) : (
          <span />
        )}
        {p.right ? (
          <span className="flex min-w-0 flex-col items-end text-end">
            <span className="text-[13px] text-neutral-500">{p.right.label}</span>
            <span className="text-[17px] font-semibold tabular-nums">{p.right.value}</span>
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** Four tiles for the chosen period. */
export function PeriodTiles({ className = "" }: { className?: string }) {
  const { key, periods, ar } = usePeriod();
  const t = periods[key].tiles;
  const ring = t.appsPct != null ? Math.round((t.appsPct / 100) * 131.9 * 10) / 10 : 0;
  const scope = key === "week" ? (ar ? "هذا الأسبوع" : "this week") : key === "month" ? (ar ? "هذا الشهر" : "this month") : ar ? "هذه السنة" : "this year";
  return (
    <section data-reveal="" className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3 px-1 pb-2 pt-1">
        <h2 className="text-[20px] font-bold leading-[25px]">{ar ? "باختصار" : "At a glance"}</h2>
        <span className="text-[15px] text-neutral-500">{scope}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Tile
          label={ar ? "الطلبات" : "Orders"}
          value={t.orders != null ? <CountUpText key={`o${key}`} text={fmt0(t.orders)} from={0.6} /> : "—"}
          note={t.perDay != null ? (ar ? `${t.perDay} يومياً` : `${t.perDay} a day`) : ar ? "من نقاط البيع" : "from the POS"}
          href="/owner/orders"
        />
        <Tile
          label={ar ? "متوسط الطلب" : "Average order"}
          value={t.avgOrder != null ? t.avgOrder.toFixed(1) : "—"}
          unit={t.avgOrder != null ? "AED" : undefined}
          note={ar ? "المبيعات ÷ الطلبات" : "sales ÷ orders"}
        />
        <Tile
          label={ar ? "تطبيقات التوصيل" : "Delivery apps"}
          value={t.appsPct != null ? `${t.appsPct}%` : "—"}
          note={t.appsAmount > 0 ? `${fmt0(t.appsAmount)}${t.appsLead ? ` · ${t.appsLead} ${ar ? "الأعلى" : "led"}` : " AED"}` : undefined}
          href="/owner/sales"
        >
          {t.appsPct != null ? (
            <svg width="40" height="40" viewBox="0 0 52 52" aria-hidden>
              <circle cx="26" cy="26" r="21" fill="none" stroke="#E5E5EA" strokeWidth="8" />
              <circle cx="26" cy="26" r="21" fill="none" stroke="#1E6EF4" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${ring} 131.9`} transform="rotate(-90 26 26)" style={{ transition: "stroke-dasharray .6s cubic-bezier(.3,.9,.3,1)" }} />
            </svg>
          ) : null}
        </Tile>
        <Tile
          label={ar ? "الفواتير" : "Bills"}
          value={<CountUpText key={`b${key}`} text={fmt0(t.bills)} from={0.6} />}
          unit="AED"
          note={t.billsPct != null ? (ar ? `${t.billsPct}٪ من المبيعات · ${t.billsCount} فاتورة` : `${t.billsPct}% of sales · ${t.billsCount} bill${t.billsCount === 1 ? "" : "s"}`) : undefined}
          href="/owner/expenses"
        />
      </div>
    </section>
  );
}
