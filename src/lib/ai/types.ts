/**
 * Shared types for Strow AI (server engine + client chat UI).
 */

export type ChartKind = "bar" | "line" | "area" | "donut" | "hbar";

export type ChartSeries = { name: string; values: number[] };

export type TextBlock = { type: "text"; text: string };
export type ChartBlock = {
  type: "chart";
  kind: ChartKind;
  title: string;
  subtitle?: string;
  labels: string[];
  series: ChartSeries[];
  unit?: string;
  /** Read-only SQL that rebuilds this chart (column "label" + one column per series name). Lets a pin on Home stay live. */
  source?: string;
};
export type TableBlock = {
  type: "table";
  title?: string;
  columns: string[];
  rows: (string | number | null)[][];
  /** Row indexes (in `rows`) the AI wants the owner to look at, e.g. days where two figures don't match. */
  highlight?: number[];
  /** One line saying why those rows are flagged. */
  highlightNote?: string;
  /** Add a totals row for the number columns. */
  totals?: boolean;
  /** Read-only SQL that rebuilds this table (one column per column title). Lets a pin on Home stay live. */
  source?: string;
};
export type StatsBlock = {
  type: "stats";
  items: { label: string; value: string; hint?: string; tone?: "good" | "bad" | "neutral" }[];
};
export type ActionBlock = {
  type: "action";
  id: string;
  title: string;
  detail?: string | null;
  status: string;
  confidence?: number | null;
  opsCount: number;
  entityTable?: string | null;
  entityId?: string | null;
};
export type FollowupsBlock = { type: "followups"; items: string[] };
export type BillBlock = { type: "bill"; table: "expenses" | "closings"; id: string; caption?: string };
/** The steps the AI took to get the answer (shown collapsed above it). */
export type Step = { text: string; note?: string; ok?: boolean };
export type StepsBlock = { type: "steps"; items: Step[]; seconds?: number };

export type Block =
  | TextBlock
  | ChartBlock
  | TableBlock
  | StatsBlock
  | ActionBlock
  | FollowupsBlock
  | BillBlock
  | StepsBlock;

export type StreamEvent =
  | { t: "chat"; chatId: string; at?: string }
  | { t: "status"; text: string }
  /** The result of the step that just ran ("38 rows", "Applied"); ok=false when it failed. */
  | { t: "note"; text: string; ok?: boolean }
  | { t: "block"; block: Block }
  | { t: "done" }
  | { t: "error"; message: string };

export type Op =
  | { op: "update"; table: string; id: string; changes: Record<string, unknown> }
  | { op: "insert"; table: string; values: Record<string, unknown>; id?: string }
  | { op: "delete"; table: string; id: string };
