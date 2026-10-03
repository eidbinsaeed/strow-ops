import type { Block, ChartBlock } from "./types";

/**
 * Old chat history stored charts as text notes like
 *   [Chart shown: Title — May: 5687.64, Jun: 5438.68]
 * and the model sometimes copied that note into its answer instead of calling
 * show_chart. This turns any such note back into a real chart block.
 */
const NOTES = [
  /\[Chart shown:\s*([^\]]*?)\s+[—–-]\s+([^\]]+)\]/g,
  /\(note: earlier I called the show_chart tool\s*[—–-]\s*"([^"]*)";\s*data\s+([^)]+)\)/g,
];

function toNumber(raw: string): number | null {
  const s = raw
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,\s]|AED|درهم/gi, "")
    .trim();
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parse(title: string, body: string): ChartBlock | null {
  const labels: string[] = [];
  const cols: number[][] = [];
  for (const part of body.split(/,\s+|،\s*|;\s*/)) {
    const cut = Math.max(part.lastIndexOf(": "), part.lastIndexOf("="));
    if (cut <= 0) continue;
    const label = part.slice(0, cut).trim();
    const vals = part
      .slice(cut + (part[cut] === "=" ? 1 : 2))
      .split("/")
      .map(toNumber);
    if (!label || vals.some((v) => v === null)) continue;
    labels.push(label.slice(0, 40));
    cols.push(vals as number[]);
  }
  if (labels.length < 2) return null;
  const n = Math.max(...cols.map((c) => c.length));
  const series = Array.from({ length: n }, (_, k) => ({
    name: n > 1 ? `Series ${k + 1}` : "Value",
    values: cols.map((c) => c[k] ?? 0),
  }));
  const money = /AED|درهم|مصاريف|إيراد|مبيعات|sales|expense|revenue|cost|profit|صافي/i.test(title);
  return { type: "chart", kind: "bar", title: title.trim().replace(/^["“]|["”]$/g, "").slice(0, 120), labels, series, unit: money ? "AED" : undefined };
}

/** Split a text answer into text + chart blocks. Returns [] for empty text. */
export function splitChartNotes(text: string): Block[] {
  if (!text || !/\[Chart shown:|show_chart tool/.test(text)) return text ? [{ type: "text", text }] : [];
  const out: Block[] = [];
  let last = 0;
  const hits = NOTES.flatMap((re) => [...text.matchAll(re)]).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const m of hits) {
    if ((m.index ?? 0) < last) continue;
    const chart = parse(m[1], m[2]);
    if (!chart) continue;
    const before = text.slice(last, m.index).trim();
    if (before) out.push({ type: "text", text: before });
    out.push(chart);
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) out.push({ type: "text", text: rest });
  return out.length ? out : [{ type: "text", text }];
}
