"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Flip as FlipPlugin } from "gsap/Flip";
import type { ChartBlock, StatsBlock, TableBlock } from "@/lib/ai/types";
import { useLocale } from "@/components/owner/LocaleProvider";
import { Flip, gsap, motion, reducedMotion } from "@/lib/motion";
import { CountUpText } from "./CountUp";
import { ExpandButton, FullScreen, PinButton } from "./CardActions";
import { ChatToolsProvider, useChatTools, type ChatTools } from "./ChatTools";

motion();
type FlipState = ReturnType<typeof FlipPlugin.getState>;

export const PALETTE = ["#0F1C2B", "#2350D0", "#C98300", "#5F8F7F", "#8B93A7", "#B26B00", "#9AA5A0", "#47515E"];

export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (a >= 1e4) return Math.round(n / 1e3) + "k";
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(a < 10 ? 2 : 1);
}

export function fmtValue(n: number, unit?: string): string {
  const v = Number.isFinite(n) ? n : 0;
  const s = v.toLocaleString("en-US", {
    minimumFractionDigits: !Number.isInteger(v) && Math.abs(v) < 1000 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  if (!unit) return s;
  if (unit === "%") return s + "%";
  if (unit.length <= 3 && unit === unit.toUpperCase()) return `${unit} ${s}`;
  return `${s} ${unit}`;
}

function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((s) => f <= s) ?? 10) * p;
}

function short(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function useWidth(initial = 0) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.round(el.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

type S = { name: string; values: number[]; color: string; idx: number };
type Pick = { active: number | null; setActive: (i: number | null) => void };

/** Inside full screen, asking a question closes it first so the answer is visible. */
function closingAsk(tools: ChatTools, close: () => void): ChatTools {
  return { ...tools, ask: tools.ask ? (q: string) => { close(); tools.ask?.(q); } : undefined };
}

function AskIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  );
}

export function Chart({
  block,
  initialWidth = 0,
  height = 220,
  bare = false,
  frame = "card",
  extra,
}: {
  block: ChartBlock;
  initialWidth?: number;
  height?: number;
  /** Inside the full screen view: no expand button. */
  bare?: boolean;
  frame?: "card" | "apple" | "plain";
  /** Extra header bits (Home: "Live" and a remove button). */
  extra?: ReactNode;
}) {
  const canSwitch = block.kind === "bar" || block.kind === "line" || block.kind === "area";
  const [kind, setKind] = useState(block.kind);
  const [hidden, setHidden] = useState<number[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [full, setFull] = useState<number | null>(null);
  const figRef = useRef<HTMLElement | null>(null);
  const tools = useChatTools();
  const { ask } = tools;
  const ar = useLocale() === "ar";
  const { ref, w } = useWidth(initialWidth);
  const all: S[] = block.series.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length], idx: i }));
  const series = all.filter((s) => !hidden.includes(s.idx));
  const labels = block.labels;
  const radial = kind === "donut" || kind === "hbar";
  const multi = all.length > 1 && !radial;
  const pick: Pick = { active, setActive };
  const askActive = () => {
    if (!ask || active == null) return;
    const vals = series.map((s) => `${multi ? `${s.name} ` : ""}${fmtValue(s.values[active] ?? 0, block.unit)}`).join(", ");
    ask(ar ? `عن الرسم "${block.title}": اشرح ${labels[active]} — ${vals}` : `About the chart "${block.title}": explain ${labels[active]} — ${vals}`);
  };
  const frameCls = frame === "apple" ? "rounded-3xl bg-white" : frame === "plain" ? "rounded-2xl bg-white" : "rounded-2xl border border-neutral-200 bg-white";

  return (
    <figure ref={figRef} className={`overflow-hidden ${frameCls}`}>
      <div className="flex items-start justify-between gap-2 ps-4 pe-2 pt-3">
        <div className="min-w-0 pt-1">
          {block.title && !bare ? <p className="text-sm font-medium text-strow-ink">{block.title}</p> : null}
          {block.subtitle ? <p className="mt-0.5 text-xs text-neutral-500">{block.subtitle}</p> : null}
          {extra}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {canSwitch ? (
            <div className="me-1 flex shrink-0 rounded-full bg-neutral-100 p-0.5 text-[11px]">
              {(["bar", "line"] as const).map((k) => {
                const on = kind === k || (k === "line" && kind === "area");
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k === "line" && block.kind === "area" ? "area" : k)}
                    className={`rounded-full px-3 py-1.5 transition ${on ? "bg-white text-strow-ink shadow-sm" : "text-neutral-500"}`}
                  >
                    {k === "bar" ? (ar ? "أعمدة" : "Bars") : ar ? "خط" : "Line"}
                  </button>
                );
              })}
            </div>
          ) : null}
          {!bare ? (
            <>
              <ExpandButton label={ar ? "ملء الشاشة" : "Full screen"} onClick={() => setFull(Math.round(Math.min(Math.max(260, window.innerHeight * 0.58), 520)))} />
              <PinButton block={block} />
            </>
          ) : null}
        </div>
      </div>

      {!radial ? (
        <div className="flex h-10 items-center gap-3 overflow-x-auto whitespace-nowrap px-4 text-xs">
          {active != null && labels[active] != null ? (
            <>
              <span className="shrink-0 font-medium text-strow-ink">{labels[active]}</span>
              {series.map((s) => (
                <span key={s.idx} className="flex shrink-0 items-center gap-1 tabular-nums text-neutral-600">
                  <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {multi ? <span className="text-neutral-400">{s.name}</span> : null}
                  {fmtValue(s.values[active] ?? 0, block.unit)}
                </span>
              ))}
              {ask ? (
                <button type="button" onClick={askActive} className="ms-auto flex shrink-0 items-center gap-1 rounded-full bg-[#E8F0FE] px-2.5 py-1.5 text-[12px] font-semibold text-[#1650C4] active:scale-95">
                  <AskIcon />
                  {ar ? "اسأل لماذا" : "Ask why"}
                </button>
              ) : null}
            </>
          ) : (
            <span className="text-neutral-400">{ar ? "اضغط أو مرّر على الرسم لترى القيم" : "Tap or slide across the chart to see values"}</span>
          )}
        </div>
      ) : null}

      <div ref={ref} className="px-2 pb-3">
        {w > 0 ? (
          series.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400">All series hidden</p>
          ) : kind === "donut" ? (
            <Donut series={series} labels={labels} w={w} unit={block.unit} {...pick} />
          ) : kind === "hbar" ? (
            <HBars series={series} labels={labels} unit={block.unit} {...pick} />
          ) : kind === "line" || kind === "area" ? (
            <Lines series={series} labels={labels} w={w} h={height} area={kind === "area"} {...pick} />
          ) : (
            <Bars series={series} labels={labels} w={w} h={height} {...pick} />
          )
        ) : (
          <div style={{ height: radial ? 160 : height }} />
        )}
      </div>

      {multi ? (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {all.map((s) => {
            const off = hidden.includes(s.idx);
            return (
              <button
                key={s.idx}
                type="button"
                onClick={() =>
                  setHidden((h) => (off ? h.filter((x) => x !== s.idx) : h.length + 1 >= all.length ? h : [...h, s.idx]))
                }
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                  off ? "border-neutral-200 text-neutral-400 line-through" : "border-neutral-300 text-neutral-700"
                }`}
              >
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: off ? "#d4d4d4" : s.color }} />
                {s.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {full != null ? (
        <FullScreen origin={figRef.current} title={block.title || (ar ? "رسم بياني" : "Chart")} onClose={() => setFull(null)} actions={<PinButton block={block} />}>
          <ChatToolsProvider value={closingAsk(tools, () => setFull(null))}>
            <Chart block={block} height={full} bare frame="plain" />
          </ChatToolsProvider>
        </FullScreen>
      ) : null}
    </figure>
  );
}

function scale(series: S[], n: number) {
  const vals = series.flatMap((s) => s.values.slice(0, n));
  const top = niceCeil(Math.max(0, ...vals));
  const minV = Math.min(0, ...vals);
  const bottom = minV < 0 ? -niceCeil(-minV) : 0;
  return { top, bottom, span: top - bottom || 1 };
}

const PAD = { L: 40, R: 10, T: 10, B: 28 };

function Axis({ w, y, bottom, span }: { w: number; y: (v: number) => number; bottom: number; span: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((k) => {
        const t = bottom + (span * k) / 4;
        return (
          <g key={k}>
            <line x1={PAD.L} x2={w - PAD.R} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#d6d3d1" : "#efefed"} strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={PAD.L - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="#9ca3af">
              {fmtCompact(t)}
            </text>
          </g>
        );
      })}
    </>
  );
}

function Bars({ series, labels, w, h: H, active, setActive }: { series: S[]; labels: string[]; w: number; h: number } & Pick) {
  const n = Math.max(1, labels.length);
  const { bottom, span } = scale(series, n);
  const y = (v: number) => PAD.T + (H - PAD.T - PAD.B) * (1 - (v - bottom) / span);
  const innerW = Math.max(20, w - PAD.L - PAD.R);
  const band = innerW / n;
  const gap = Math.min(14, band * 0.3);
  const bw = Math.max(1.5, (band - gap) / Math.max(1, series.length));
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 46))));
  const y0 = y(0);
  const pickAt = (clientX: number, rect: DOMRect) => {
    const i = Math.floor((clientX - rect.left - PAD.L) / band);
    setActive(i >= 0 && i < n ? i : null);
  };
  return (
    <svg
      width={w}
      height={H}
      className="block touch-pan-y select-none"
      role="img"
      onPointerDown={(e) => pickAt(e.clientX, e.currentTarget.getBoundingClientRect())}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" || e.buttons) pickAt(e.clientX, e.currentTarget.getBoundingClientRect());
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setActive(null);
      }}
    >
      <Axis w={w} y={y} bottom={bottom} span={span} />
      {active != null ? <rect x={PAD.L + active * band} y={PAD.T} width={band} height={H - PAD.T - PAD.B} fill="#f5f5f4" rx={6} /> : null}
      {labels.map((_, i) =>
        series.map((s, j) => {
          const v = s.values[i] ?? 0;
          const yv = y(v);
          return (
            <rect
              key={`${i}-${j}`}
              className="ai-bar"
              style={{ animationDelay: `${Math.min(i * 30, 700)}ms`, transformOrigin: `0px ${y0}px` }}
              x={PAD.L + i * band + gap / 2 + j * bw}
              y={Math.min(y0, yv)}
              width={Math.max(1, bw - (series.length > 1 ? 2 : 0))}
              height={Math.max(0.5, Math.abs(y0 - yv))}
              rx={Math.min(5, bw / 3)}
              fill={s.color}
              opacity={active == null || active === i ? 1 : 0.35}
            />
          );
        }),
      )}
      {labels.map((lab, i) =>
        i % every === 0 ? (
          <text
            key={i}
            x={PAD.L + i * band + band / 2}
            y={H - 9}
            textAnchor="middle"
            fontSize="10.5"
            fill={active === i ? "#1a1a1a" : "#6b7280"}
            fontWeight={active === i ? 600 : 400}
          >
            {short(lab, 9)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function Lines({ series, labels, w, h: H, area, active, setActive }: { series: S[]; labels: string[]; w: number; h: number; area: boolean } & Pick) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = Math.max(1, labels.length);
  const { bottom, span } = scale(series, n);
  const y = (v: number) => PAD.T + (H - PAD.T - PAD.B) * (1 - (v - bottom) / span);
  const innerW = Math.max(20, w - PAD.L - PAD.R);
  const step = n > 1 ? innerW / (n - 1) : innerW;
  const x = (i: number) => PAD.L + (n === 1 ? innerW / 2 : i * step);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 46))));
  const pickAt = (clientX: number, rect: DOMRect) => {
    const i = n === 1 ? 0 : Math.round((clientX - rect.left - PAD.L) / step);
    setActive(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <svg
      width={w}
      height={H}
      className="block touch-pan-y select-none"
      role="img"
      onPointerDown={(e) => pickAt(e.clientX, e.currentTarget.getBoundingClientRect())}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" || e.buttons) pickAt(e.clientX, e.currentTarget.getBoundingClientRect());
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setActive(null);
      }}
    >
      <defs>
        {series.map((s) => (
          <linearGradient key={s.idx} id={`g${uid}${s.idx}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      <Axis w={w} y={y} bottom={bottom} span={span} />
      {active != null ? <line x1={x(active)} x2={x(active)} y1={PAD.T} y2={H - PAD.B} stroke="#d6d3d1" strokeDasharray="3 3" /> : null}
      {series.map((s) => {
        const d = labels.map((_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.values[i] ?? 0).toFixed(1)}`).join(" ");
        return (
          <g key={s.idx}>
            {area || series.length === 1 ? (
              <path className="ai-fade" d={`${d} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`} fill={`url(#g${uid}${s.idx})`} />
            ) : null}
            <path className="ai-line" d={d} pathLength={1} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            {n <= 31
              ? labels.map((_, i) => (
                  <circle key={i} cx={x(i)} cy={y(s.values[i] ?? 0)} r={active === i ? 5 : 2.5} fill={active === i ? s.color : "#fff"} stroke={s.color} strokeWidth={1.5} />
                ))
              : active != null ? <circle cx={x(active)} cy={y(s.values[active] ?? 0)} r={5} fill={s.color} /> : null}
          </g>
        );
      })}
      {labels.map((lab, i) =>
        i % every === 0 ? (
          <text key={i} x={x(i)} y={H - 9} textAnchor={n > 1 && i === n - 1 ? "end" : "middle"} fontSize="10.5" fill={active === i ? "#1a1a1a" : "#6b7280"} fontWeight={active === i ? 600 : 400}>
            {short(lab, 9)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function Donut({ series, labels, w, unit, active, setActive }: { series: S[]; labels: string[]; w: number; unit?: string } & Pick) {
  const s0 = series[0];
  const vals = labels.map((_, i) => Math.max(0, s0?.values[i] ?? 0));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const size = Math.round(Math.min(210, Math.max(150, w * 0.5)));
  const stroke = 22;
  const r = size / 2 - stroke / 2 - 5;
  const C = 2 * Math.PI * r;
  const c = size / 2;
  let off = 0;
  const segs = vals.map((v, i) => {
    const len = (v / total) * C;
    const seg = { i, len, off };
    off += len;
    return seg;
  });
  const shownLabel = active != null ? labels[active] : "Total";
  const shownValue = active != null ? vals[active] : total;
  return (
    <div className="flex flex-col items-center gap-4 px-2 pt-3 sm:flex-row sm:items-center">
      <svg width={size} height={size} className="shrink-0" role="img">
        <circle cx={c} cy={c} r={r} fill="none" stroke="#f3f3f1" strokeWidth={stroke} />
        {segs.map((sg) =>
          sg.len > 0 ? (
            <circle
              key={sg.i}
              className="ai-fade cursor-pointer"
              style={{ animationDelay: `${sg.i * 70}ms` }}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={PALETTE[sg.i % PALETTE.length]}
              strokeWidth={active === sg.i ? stroke + 6 : stroke}
              strokeDasharray={`${Math.max(0, sg.len - 1.5)} ${C}`}
              strokeDashoffset={-sg.off}
              transform={`rotate(-90 ${c} ${c})`}
              onPointerDown={() => setActive(active === sg.i ? null : sg.i)}
            />
          ) : null,
        )}
        <text x={c} y={c - 4} textAnchor="middle" fontSize="11" fill="#6b7280">
          {short(String(shownLabel ?? ""), 18)}
        </text>
        <text x={c} y={c + 16} textAnchor="middle" fontSize="16" fontWeight={500} fill="#1a1a1a">
          {fmtValue(Math.round(shownValue * 100) / 100, unit)}
        </text>
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-0.5">
        {labels.map((lab, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => setActive(active === i ? null : i)}
              className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-start text-sm transition ${active === i ? "bg-neutral-100" : ""}`}
            >
              <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="min-w-0 flex-1 truncate text-neutral-700">{lab}</span>
              <span className="shrink-0 tabular-nums text-neutral-500">{Math.round((vals[i] / total) * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HBars({ series, labels, unit, active, setActive }: { series: S[]; labels: string[]; unit?: string } & Pick) {
  const s0 = series[0];
  const vals = labels.map((_, i) => s0?.values[i] ?? 0);
  const max = Math.max(1e-9, ...vals.map((v) => Math.abs(v)));
  return (
    <div className="space-y-1 px-2 pt-3">
      {labels.map((lab, i) => {
        const pct = Math.max(1.5, (Math.abs(vals[i]) / max) * 100);
        return (
          <button key={i} type="button" onClick={() => setActive(active === i ? null : i)} className={`block w-full rounded-xl px-2 py-1.5 text-start transition ${active === i ? "bg-neutral-50" : ""}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={`min-w-0 truncate ${active === i ? "font-medium text-strow-ink" : "text-neutral-700"}`}>{lab}</span>
              <span className="shrink-0 tabular-nums text-neutral-500">{fmtValue(vals[i], unit)}</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="ai-hbar h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: i === 0 ? PALETTE[1] : PALETTE[0],
                  animationDelay: `${i * 60}ms`,
                  opacity: active == null || active === i ? 1 : 0.4,
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function Stats({ block }: { block: StatsBlock }) {
  const tone = (t?: string) => (t === "good" ? "text-emerald-600" : t === "bad" ? "text-red-600" : "text-neutral-400");
  return (
    <div className={`grid gap-2 ${block.items.length >= 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
      {block.items.map((it, i) => (
        <div key={i} className="ai-rise rounded-2xl border border-neutral-200 bg-white p-3.5" style={{ animationDelay: `${i * 60}ms` }}>
          <p className="text-[11px] uppercase tracking-wider text-neutral-500">{it.label}</p>
          <p className="mt-1 text-xl font-light text-strow-ink">
            <CountUpText text={it.value} />
          </p>
          {it.hint ? <p className={`mt-0.5 text-xs ${tone(it.tone)}`}>{it.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

function cmp(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const na = typeof a === "number" ? a : parseFloat(String(a).replace(/[^0-9.\-]/g, ""));
  const nb = typeof b === "number" ? b : parseFloat(String(b).replace(/[^0-9.\-]/g, ""));
  if (Number.isFinite(na) && Number.isFinite(nb) && (typeof a === "number" || /^[\sA-Z]*-?[\d,.]+\s*%?$/.test(String(a)))) return na - nb;
  return String(a).localeCompare(String(b));
}

const GAP_COL = /\b(gap|diff|difference|variance|mismatch|over\/short)\b|فرق|الفرق/i;

/** Rows to flag when the AI didn't say: a "Gap" / "Difference" column that isn't zero. */
function autoFlags(block: TableBlock, numeric: boolean[]): number[] {
  const cols = block.columns.map((c, k) => (numeric[k] && GAP_COL.test(c) ? k : -1)).filter((k) => k >= 0);
  if (!cols.length) return [];
  return block.rows.flatMap((r, i) => (cols.some((k) => Math.abs(Number(r[k] ?? 0)) >= 0.5) ? [i] : []));
}

const fmtCell = (cell: string | number | null) => (cell == null ? "—" : typeof cell === "number" ? cell.toLocaleString("en-US", { maximumFractionDigits: 2 }) : cell);

export function DataTable({
  block,
  full = false,
  frame = "card",
  extra,
}: {
  block: TableBlock;
  /** Full screen: every row, no expand button. */
  full?: boolean;
  frame?: "card" | "apple" | "plain";
  extra?: ReactNode;
}) {
  const tools = useChatTools();
  const { ask } = tools;
  const ar = useLocale() === "ar";
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [expanded, setExpanded] = useState(full);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [picked, setPicked] = useState<{ r: number; c: number } | null>(null);
  const [fs, setFs] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);
  const askRef = useRef<HTMLDivElement | null>(null);
  const flipState = useRef<FlipState | null>(null);

  const numeric = useMemo(() => block.columns.map((_, c) => block.rows.length > 0 && block.rows.every((r) => r[c] == null || typeof r[c] === "number")), [block]);
  const flagged = useMemo(() => new Set(block.highlight?.length ? block.highlight : autoFlags(block, numeric)), [block, numeric]);
  const rows = useMemo(() => {
    let x = block.rows.map((r, i) => ({ r, i }));
    if (onlyFlagged) x = x.filter((e) => flagged.has(e.i));
    if (sort) x = [...x].sort((a, b) => cmp(a.r[sort.col], b.r[sort.col]) * sort.dir);
    return x;
  }, [block.rows, sort, onlyFlagged, flagged]);
  const shown = expanded ? rows : rows.slice(0, 8);
  const labelCol = Math.max(0, numeric.findIndex((n) => !n));

  // Rows glide to their new places when sorted or filtered.
  const flipNext = () => {
    if (bodyRef.current && !reducedMotion()) flipState.current = Flip.getState(Array.from(bodyRef.current.children));
  };
  useLayoutEffect(() => {
    const st = flipState.current;
    const body = bodyRef.current;
    if (!st || !body) return;
    flipState.current = null;
    const tl = Flip.from(st, {
      targets: Array.from(body.children),
      duration: 0.45,
      ease: "power2.inOut",
      stagger: 0.008,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: 0.3, delay: 0.15 }),
    });
    return () => {
      tl.progress(1);
    };
  }, [sort, onlyFlagged, expanded]);

  // Flagged rows flash once when the table first appears.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!flagged.size || !body || reducedMotion()) return;
    const cells = body.querySelectorAll("tr.ai-flag > td");
    gsap.fromTo(cells, { backgroundColor: "#FFD9A8" }, { backgroundColor: "#FFF6EA", duration: 1.1, delay: 0.35, ease: "power2.out", clearProps: "backgroundColor" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The "Ask why" bar slides up when a number is picked.
  useLayoutEffect(() => {
    if (picked && askRef.current && !reducedMotion()) gsap.fromTo(askRef.current, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: "power3.out", clearProps: "transform,opacity" });
  }, [picked]);

  const totals = block.totals
    ? block.columns.map((_, c) => (numeric[c] && c !== labelCol ? rows.reduce((a, e) => a + (typeof e.r[c] === "number" ? (e.r[c] as number) : 0), 0) : null))
    : null;

  const pickedRow = picked ? block.rows[picked.r] : null;
  const askPicked = () => {
    if (!ask || !picked || !pickedRow) return;
    const col = block.columns[picked.c];
    const value = fmtCell(pickedRow[picked.c]);
    const rowLabel = fmtCell(pickedRow[labelCol]);
    const t = block.title ? `"${block.title}"` : "";
    ask(ar ? `في الجدول ${t}: لماذا ${col} = ${value} في ${rowLabel}؟` : `In the table ${t}: why is ${col} ${value} for ${rowLabel}?`);
    setPicked(null);
  };
  const frameCls = frame === "apple" ? "rounded-3xl bg-white" : frame === "plain" ? "rounded-2xl bg-white" : "rounded-2xl border border-neutral-200 bg-white";

  return (
    <div ref={boxRef} className={`overflow-hidden ${frameCls}`}>
      <div className="flex items-start justify-between gap-2 ps-4 pe-2 pt-3">
        <div className="min-w-0 pt-1">
          {block.title && !full ? <p className="text-sm font-medium text-strow-ink">{block.title}</p> : null}
          {extra}
        </div>
        {!full ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <ExpandButton label={ar ? "ملء الشاشة" : "Full screen"} onClick={() => setFs(true)} />
            <PinButton block={block} />
          </div>
        ) : null}
      </div>

      {flagged.size ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pt-1.5 text-[13px]">
          <span className="flex min-w-0 items-center gap-1.5 text-[#A84700]">
            <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px] bg-[#C55300]" />
            <span className="min-w-0">
              {block.highlightNote ?? (ar ? "صفوف تحتاج نظرة" : "Rows to look at")} · {flagged.size}
            </span>
          </span>
          {flagged.size < block.rows.length ? (
            <button
              type="button"
              onClick={() => {
                flipNext();
                setOnlyFlagged((o) => !o);
                setPicked(null);
              }}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${onlyFlagged ? "border-[#C55300] bg-[#C55300] text-white" : "border-neutral-300 text-neutral-600"}`}
            >
              {onlyFlagged ? (ar ? "عرض الكل" : "Show all") : ar ? "هذه فقط" : "Only these"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-neutral-100">
              {block.columns.map((col, c) => (
                <th key={c} className={`px-4 py-2 font-medium text-neutral-500 ${numeric[c] ? "text-end" : "text-start"}`}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => {
                      flipNext();
                      setSort((s) => (s && s.col === c ? { col: c, dir: s.dir === 1 ? -1 : 1 } : { col: c, dir: numeric[c] ? -1 : 1 }));
                    }}
                  >
                    {col}
                    <span className="text-[10px] text-neutral-400">{sort?.col === c ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {shown.map(({ r, i }) => (
              <tr key={i} data-flip-id={`r${i}`} className={`border-b border-neutral-50 last:border-0 ${flagged.has(i) ? "ai-flag" : ""}`}>
                {r.map((cell, c) => {
                  const on = picked?.r === i && picked.c === c;
                  const tappable = !!ask && numeric[c] && typeof cell === "number";
                  return (
                    <td key={c} className={`px-4 py-2.5 ${numeric[c] ? "text-end tabular-nums" : "text-start"} text-neutral-800`}>
                      {tappable ? (
                        <button
                          type="button"
                          onClick={() => setPicked(on ? null : { r: i, c })}
                          className={`-mx-1.5 -my-1 rounded-lg px-1.5 py-1 tabular-nums transition ${on ? "bg-strow-blue text-white" : "active:bg-neutral-100"}`}
                        >
                          {fmtCell(cell)}
                        </button>
                      ) : (
                        fmtCell(cell)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {totals ? (
            <tfoot>
              <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold">
                {totals.map((t, c) => (
                  <td key={c} className={`px-4 py-2.5 ${numeric[c] && c !== labelCol ? "text-end tabular-nums" : "text-start"}`}>
                    {c === labelCol ? (ar ? "المجموع" : "Total") : t != null ? <CountUpText text={t.toLocaleString("en-US", { maximumFractionDigits: 2 })} from={0.4} /> : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {picked && pickedRow ? (
        <div ref={askRef} className="flex items-center gap-2 border-t border-neutral-100 bg-[#F7F9FE] px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-600">
            {block.columns[picked.c]} · {fmtCell(pickedRow[labelCol])} · <b className="text-strow-ink">{fmtCell(pickedRow[picked.c])}</b>
          </span>
          <button type="button" onClick={askPicked} className="flex shrink-0 items-center gap-1 rounded-full bg-strow-blue px-3 py-1.5 text-[13px] font-semibold text-white active:scale-95">
            <AskIcon />
            {ar ? "اسأل لماذا" : "Ask why"}
          </button>
        </div>
      ) : null}

      {!full && rows.length > 8 ? (
        <button
          type="button"
          onClick={() => {
            flipNext();
            setExpanded((e) => !e);
          }}
          className="w-full border-t border-neutral-100 py-3 text-sm text-neutral-600"
        >
          {expanded ? (ar ? "عرض أقل" : "Show less") : ar ? `عرض كل الصفوف (${rows.length})` : `Show all ${rows.length} rows`}
        </button>
      ) : null}

      {fs ? (
        <FullScreen origin={boxRef.current} title={block.title || (ar ? "جدول" : "Table")} onClose={() => setFs(false)} actions={<PinButton block={block} />}>
          <ChatToolsProvider value={closingAsk(tools, () => setFs(false))}>
            <DataTable block={block} full frame="plain" />
          </ChatToolsProvider>
        </FullScreen>
      ) : null}
    </div>
  );
}
