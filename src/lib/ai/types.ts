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
};
export type TableBlock = {
  type: "table";
  title?: string;
  columns: string[];
  rows: (string | number | null)[][];
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

export type Block =
  | TextBlock
  | ChartBlock
  | TableBlock
  | StatsBlock
  | ActionBlock
  | FollowupsBlock
  | BillBlock;

export type StreamEvent =
  | { t: "chat"; chatId: string }
  | { t: "status"; text: string }
  | { t: "block"; block: Block }
  | { t: "done" }
  | { t: "error"; message: string };

export type Op =
  | { op: "update"; table: string; id: string; changes: Record<string, unknown> }
  | { op: "insert"; table: string; values: Record<string, unknown>; id?: string }
  | { op: "delete"; table: string; id: string };
