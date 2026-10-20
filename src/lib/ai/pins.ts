/**
 * Live charts and tables: a block plus the read-only SQL that rebuilds it.
 * Used when the AI shows a chart (to check its source_sql really fits), when
 * the owner pins one to Home, and when Home loads its pins.
 *
 * Postgres returns query rows as JSON objects whose key order is not kept, so
 * the SQL names its columns: charts use "label" plus one column per series
 * name; tables use one column per column title.
 */
import { createServiceClient } from "@/lib/supabase/server";
import type { ChartBlock, TableBlock } from "./types";

type Row = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};
const cell = (v: unknown): string | number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return String(v).slice(0, 200);
};

/** Rebuilds the block from query rows, or explains why the rows don't fit. */
export function blockFromRows<B extends ChartBlock | TableBlock>(block: B, rows: Row[]): { block: B } | { error: string } {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  if (block.type === "chart") {
    if (rows.length && !keys.includes("label")) return { error: `no "label" column (got ${keys.join(", ")})` };
    const missing = block.series.map((s) => s.name).filter((n) => rows.length && !keys.includes(n));
    if (missing.length) return { error: `no column for series ${missing.map((m) => `"${m}"`).join(", ")} (got ${keys.join(", ")})` };
    const use = rows.slice(0, 60);
    return {
      block: {
        ...block,
        labels: use.map((r) => String(r.label ?? "")),
        series: block.series.map((s) => ({ name: s.name, values: use.map((r) => num(r[s.name])) })),
      },
    };
  }
  const missing = block.columns.filter((c) => rows.length && !keys.includes(c));
  if (missing.length) return { error: `no column for ${missing.map((m) => `"${m}"`).join(", ")} (got ${keys.join(", ")})` };
  return {
    block: {
      ...block,
      rows: rows.slice(0, 200).map((r) => block.columns.map((c) => cell(r[c]))),
      highlight: undefined, // the flagged rows were for the moment it was asked; the gap check runs again on its own
    },
  };
}

/** Runs the SQL (read-only, through ai_read_query) and rebuilds the block. */
export async function runSource<B extends ChartBlock | TableBlock>(block: B, sql: string): Promise<{ block: B } | { error: string }> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("ai_read_query", { q: sql, max_rows: 200 });
  if (error) return { error: `SQL error: ${error.message}` };
  return blockFromRows(block, (Array.isArray(data) ? data : []) as Row[]);
}

export type HomePin = { id: string; block: ChartBlock | TableBlock; live: boolean; asOf: string };

/** Home's pins, each rebuilt from its SQL when it has one (falls back to the snapshot if that fails). */
export async function loadPins(): Promise<HomePin[]> {
  const db = createServiceClient();
  const { data } = await db.from("ai_pins").select("id, block, source_sql, created_at").order("position").order("created_at").limit(12);
  const pins = (data ?? []) as { id: string; block: ChartBlock | TableBlock; source_sql: string | null; created_at: string }[];
  const now = new Date().toISOString();
  return Promise.all(
    pins.map(async (p) => {
      if (!p.source_sql) return { id: p.id, block: p.block, live: false, asOf: p.created_at };
      const r = await runSource(p.block, p.source_sql).catch(() => ({ error: "failed" }) as const);
      return "block" in r ? { id: p.id, block: r.block, live: true, asOf: now } : { id: p.id, block: p.block, live: false, asOf: p.created_at };
    }),
  );
}
