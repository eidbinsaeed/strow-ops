/**
 * Tools Strow AI can call, and their executors.
 */
import type { Tool, TextBlockParam, ImageBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { createServiceClient } from "@/lib/supabase/server";
import { downloadDriveFile } from "@/lib/drive/upload";
import { recordAction, validateOps } from "./ops";
import type { ActionBlock, Block, ChartBlock, ChartKind, StatsBlock, StreamEvent, TableBlock } from "./types";

export type AgentMode = "chat" | "autopilot";

export type ToolContext = {
  mode: AgentMode;
  chatId?: string | null;
  runId?: string | null;
  emit: (e: StreamEvent) => void;
  blocks: Block[];
  photosLeft: number;
  actions: { id: string; status: string }[];
};

export type ToolOutcome = {
  content: string | Array<TextBlockParam | ImageBlockParam>;
  isError?: boolean;
};

type Json = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function driveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(url) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(url);
  return m ? m[1] : null;
}

const OP_ITEM = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["update", "insert", "delete"] },
    table: { type: "string" },
    id: { type: "string", description: "Row uuid (update and delete)" },
    changes: { type: "object", description: "update: the columns to set" },
    values: { type: "object", description: "insert: the columns of the new row" },
  },
  required: ["op", "table"],
};

const CHANGE_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string", description: "Short title the owner sees, e.g. 'Milk bill 13 Aug: quantity 8 → 1'" },
    reason: { type: "string", description: "Why this is right, with the evidence (1–3 sentences)" },
    confidence: { type: "number", description: "0 to 1" },
    severity: { type: "string", enum: ["info", "warn", "critical"] },
    ops: {
      type: "array",
      items: OP_ITEM,
      description:
        "Row changes. Writable tables: closings, expenses, expense_line_items, suppliers, categories, inventory_items, item_aliases, fixed_costs, liabilities, cash_events (insert only), baristas (update only), attendance_days, leave_requests, staff_reports, payroll_adjustments. Deletes only on expense_line_items and item_aliases — to remove a bill or closing set its status to 'rejected'.",
    },
    entity_table: { type: "string", description: "Main record this is about, e.g. expenses" },
    entity_id: { type: "string", description: "uuid of that record" },
  },
  required: ["title", "reason", "confidence", "ops"],
};

export const TOOLS: Record<string, Tool> = {
  query_db: {
    name: "query_db",
    description:
      "Run ONE read-only SQL query (PostgreSQL SELECT or WITH) on the café database; returns up to 200 rows as JSON. Aggregate in SQL. Tables of other projects are not available.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string" },
        purpose: { type: "string", description: "3–6 words shown to the owner while it runs, e.g. 'Totalling milk spend by month'" },
      },
      required: ["sql"],
    },
  },
  change_data: {
    name: "change_data",
    description:
      "Change café data. In chat it is applied immediately (the owner gets an Undo button); in Autopilot it is applied only when confidence ≥ 0.9, otherwise saved as a proposal. Every change is logged with its before-state.",
    input_schema: CHANGE_SCHEMA,
  },
  propose_change: {
    name: "propose_change",
    description: "Prepare a change the owner approves with one tap (nothing changes until he approves). Use for deletions, merges, big batches, or when unsure.",
    input_schema: CHANGE_SCHEMA,
  },
  flag_issue: {
    name: "flag_issue",
    description: "Raise an alert only the owner can resolve (missing closings, a cash recount, an unreadable bill). Shown on his dashboard.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        detail: { type: "string" },
        severity: { type: "string", enum: ["info", "warn", "critical"] },
        entity_table: { type: "string" },
        entity_id: { type: "string" },
      },
      required: ["title", "detail"],
    },
  },
  view_bill_photo: {
    name: "view_bill_photo",
    description: "Look at the original photo of a purchase bill (expenses) or sales closing (closings) so you can read it yourself.",
    input_schema: {
      type: "object",
      properties: { table: { type: "string", enum: ["expenses", "closings"] }, id: { type: "string" } },
      required: ["table", "id"],
    },
  },
  show_bill: {
    name: "show_bill",
    description: "Show the owner the photo of a bill or closing inside the chat (he can tap to zoom).",
    input_schema: {
      type: "object",
      properties: { table: { type: "string", enum: ["expenses", "closings"] }, id: { type: "string" }, caption: { type: "string" } },
      required: ["table", "id"],
    },
  },
  remember: {
    name: "remember",
    description: "Save a durable lesson to your memory (supplier invoice layout, normal price, owner preference, recurring mistake). Keep it short and specific.",
    input_schema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["supplier", "invoice_format", "price_norm", "item", "rule", "owner_preference", "business", "general"] },
        subject: { type: "string" },
        note: { type: "string" },
      },
      required: ["note"],
    },
  },
  forget: {
    name: "forget",
    description: "Retire a memory note that turned out to be wrong or outdated.",
    input_schema: { type: "object", properties: { memory_id: { type: "string" } }, required: ["memory_id"] },
  },
  show_chart: {
    name: "show_chart",
    description:
      "Show an interactive chart in the chat (the owner can tap for values, switch bar/line, toggle series). kind: bar | line | area | donut | hbar. One value per label in every series.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["bar", "line", "area", "donut", "hbar"] },
        title: { type: "string" },
        subtitle: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
        series: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, values: { type: "array", items: { type: "number" } } },
            required: ["name", "values"],
          },
        },
        unit: { type: "string", description: "e.g. AED, %, kg" },
      },
      required: ["kind", "title", "labels", "series"],
    },
  },
  show_table: {
    name: "show_table",
    description: "Show a sortable table in the chat.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        columns: { type: "array", items: { type: "string" } },
        rows: { type: "array", items: { type: "array", items: { type: ["string", "number", "null"] } } },
      },
      required: ["columns", "rows"],
    },
  },
  show_stats: {
    name: "show_stats",
    description: "Show 2–4 headline numbers as cards.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string", description: "Formatted, e.g. 'AED 11,368'" },
              hint: { type: "string" },
              tone: { type: "string", enum: ["good", "bad", "neutral"] },
            },
            required: ["label", "value"],
          },
        },
      },
      required: ["items"],
    },
  },
  suggest_followups: {
    name: "suggest_followups",
    description: "Offer 2–3 short follow-up questions the owner can tap. Call once, at the end of your answer.",
    input_schema: {
      type: "object",
      properties: { questions: { type: "array", items: { type: "string" } } },
      required: ["questions"],
    },
  },
};

export const DISPLAY_TOOLS = new Set(["show_chart", "show_table", "show_stats", "show_bill", "suggest_followups"]);

export function toolsFor(mode: AgentMode): Tool[] {
  return Object.values(TOOLS).filter((t) => mode === "chat" || !DISPLAY_TOOLS.has(t.name));
}

export function statusFor(name: string, input: unknown): string {
  const i = (input ?? {}) as Json;
  switch (name) {
    case "query_db":
      return str(i.purpose)?.slice(0, 80) ?? "Reading your books";
    case "change_data":
      return "Fixing: " + (str(i.title) ?? "data").slice(0, 70);
    case "propose_change":
      return "Preparing a suggestion";
    case "flag_issue":
      return "Flagging: " + (str(i.title) ?? "an issue").slice(0, 70);
    case "view_bill_photo":
      return "Reading the bill photo";
    case "show_bill":
      return "Fetching the bill";
    case "remember":
      return "Saving what I learned";
    case "forget":
      return "Updating my memory";
    case "suggest_followups":
      return "Wrapping up";
    default:
      return "Drawing it";
  }
}

export function sanitizeChart(i: Json): ChartBlock {
  const kinds: ChartKind[] = ["bar", "line", "area", "donut", "hbar"];
  const kind = kinds.includes(i.kind as ChartKind) ? (i.kind as ChartKind) : "bar";
  const rawSeries = (Array.isArray(i.series) ? i.series : []).slice(0, 6) as Json[];
  let labels = (Array.isArray(i.labels) ? i.labels : []).slice(0, 60).map((l) => String(l ?? ""));
  if (!labels.length) {
    const n = Math.max(0, ...rawSeries.map((s) => (Array.isArray(s?.values) ? (s.values as unknown[]).length : 0)));
    labels = Array.from({ length: Math.min(n, 60) }, (_, k) => String(k + 1));
  }
  const series = rawSeries.map((s, idx) => ({
    name: String(s?.name ?? `Series ${idx + 1}`).slice(0, 40),
    values: labels.map((_, k) => num(Array.isArray(s?.values) ? (s.values as unknown[])[k] : 0)),
  }));
  return {
    type: "chart",
    kind,
    title: String(i.title ?? "").slice(0, 120),
    subtitle: str(i.subtitle)?.slice(0, 160) ?? undefined,
    labels,
    series: series.length ? series : [{ name: "Value", values: labels.map(() => 0) }],
    unit: str(i.unit)?.slice(0, 8) ?? undefined,
  };
}

export function sanitizeTable(i: Json): TableBlock {
  const columns = (Array.isArray(i.columns) ? i.columns : []).slice(0, 12).map((c) => String(c ?? ""));
  const rows = (Array.isArray(i.rows) ? i.rows : []).slice(0, 200).map((r) =>
    columns.map((_, c) => {
      const v = Array.isArray(r) ? (r as unknown[])[c] : null;
      if (v == null) return null;
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      return String(v).slice(0, 200);
    }),
  );
  return { type: "table", title: str(i.title)?.slice(0, 120) ?? undefined, columns, rows };
}

export function sanitizeStats(i: Json): StatsBlock {
  const tones = ["good", "bad", "neutral"];
  const items = (Array.isArray(i.items) ? i.items : []).slice(0, 6).map((raw) => {
    const it = (raw ?? {}) as Json;
    return {
      label: String(it.label ?? "").slice(0, 40),
      value: String(it.value ?? "").slice(0, 32),
      hint: str(it.hint)?.slice(0, 80) ?? undefined,
      tone: tones.includes(String(it.tone)) ? (it.tone as "good" | "bad" | "neutral") : undefined,
    };
  });
  return { type: "stats", items };
}

function show(ctx: ToolContext, block: Block): ToolOutcome {
  ctx.blocks.push(block);
  ctx.emit({ t: "block", block });
  return { content: "Shown to the owner." };
}

async function queryDb(i: Json): Promise<ToolOutcome> {
  const sql = String(i.sql ?? "").trim();
  if (!sql) return { content: "Empty query.", isError: true };
  const db = createServiceClient();
  const { data, error } = await db.rpc("ai_read_query", { q: sql, max_rows: 200 });
  if (error) return { content: `SQL error: ${error.message}`, isError: true };
  const rows = (Array.isArray(data) ? data : []) as unknown[];
  let text = JSON.stringify(rows);
  if (text.length > 24000) text = text.slice(0, 24000) + ` … (truncated, ${rows.length} rows — aggregate more or add LIMIT)`;
  return { content: `${rows.length} row(s): ${text}` };
}

async function change(i: Json, ctx: ToolContext, applyNow: boolean): Promise<ToolOutcome> {
  const ops = validateOps(i.ops);
  const confidence = Math.max(0, Math.min(1, num(i.confidence ?? 0.5)));
  const apply = applyNow ? (ctx.mode === "chat" ? true : confidence >= 0.9) : false;
  const sev = ["info", "warn", "critical"].includes(String(i.severity)) ? (i.severity as "info" | "warn" | "critical") : "info";
  const res = await recordAction({
    source: ctx.mode === "chat" ? "chat" : "autopilot",
    title: String(i.title ?? "Change"),
    detail: String(i.reason ?? ""),
    confidence,
    severity: sev,
    ops,
    apply,
    entityTable: str(i.entity_table),
    entityId: str(i.entity_id),
    runId: ctx.runId ?? null,
    chatId: ctx.chatId ?? null,
  });
  ctx.actions.push({ id: res.id, status: res.status });
  if (ctx.mode === "chat" && res.id) {
    const block: ActionBlock = {
      type: "action",
      id: res.id,
      title: String(i.title ?? "Change").slice(0, 200),
      detail: str(i.reason),
      status: res.status,
      confidence,
      opsCount: ops.length,
      entityTable: str(i.entity_table),
      entityId: str(i.entity_id),
    };
    ctx.blocks.push(block);
    ctx.emit({ t: "block", block });
  }
  if (res.status === "failed") return { content: `Failed and rolled back: ${res.error}`, isError: true };
  return {
    content:
      res.status === "applied"
        ? `Applied (action ${res.id}). The owner can undo it.`
        : `Saved as a proposal for the owner to approve (action ${res.id}).`,
  };
}

async function flag(i: Json, ctx: ToolContext): Promise<ToolOutcome> {
  const title = String(i.title ?? "").trim().slice(0, 200);
  if (!title) return { content: "A title is required.", isError: true };
  const db = createServiceClient();
  const { data: existing } = await db.from("ai_actions").select("id").in("status", ["proposed", "info"]).eq("title", title).limit(1);
  if (existing && existing.length) return { content: "Already flagged earlier — skipped." };
  const sev = ["info", "warn", "critical"].includes(String(i.severity)) ? (i.severity as "info" | "warn" | "critical") : "warn";
  const res = await recordAction({
    source: ctx.mode === "chat" ? "chat" : "autopilot",
    title,
    detail: String(i.detail ?? ""),
    severity: sev,
    apply: false,
    status: "info",
    entityTable: str(i.entity_table),
    entityId: str(i.entity_id),
    runId: ctx.runId ?? null,
    chatId: ctx.chatId ?? null,
  });
  ctx.actions.push({ id: res.id, status: "info" });
  if (ctx.mode === "chat") {
    const block: ActionBlock = { type: "action", id: res.id, title, detail: str(i.detail), status: "info", opsCount: 0, entityTable: str(i.entity_table), entityId: str(i.entity_id) };
    ctx.blocks.push(block);
    ctx.emit({ t: "block", block });
  }
  return { content: `Flagged for the owner (action ${res.id}).` };
}

function mediaType(m: string): ImageBlockParam["source"]["media_type"] | null {
  const t = m.toLowerCase();
  if (t.includes("jpeg") || t.includes("jpg")) return "image/jpeg";
  if (t.includes("png")) return "image/png";
  if (t.includes("webp")) return "image/webp";
  if (t.includes("gif")) return "image/gif";
  return null;
}

async function photoRow(table: string, id: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from(table).select("photo_drive_url").eq("id", id).maybeSingle();
  return (data as { photo_drive_url?: string | null } | null)?.photo_drive_url ?? null;
}

async function viewPhoto(i: Json, ctx: ToolContext): Promise<ToolOutcome> {
  if (ctx.photosLeft <= 0) return { content: "Photo limit for this run reached.", isError: true };
  const table = i.table === "closings" ? "closings" : "expenses";
  const id = String(i.id ?? "");
  if (!UUID.test(id)) return { content: "Invalid id.", isError: true };
  const fileId = driveFileId(await photoRow(table, id));
  if (!fileId) return { content: "This record has no photo.", isError: true };
  const file = await downloadDriveFile(fileId);
  if (!file) return { content: "Could not download the photo from Drive.", isError: true };
  const mt = mediaType(file.mimeType);
  if (!mt) return { content: `Unsupported photo type ${file.mimeType}.`, isError: true };
  if (file.bytes.length > 4_800_000) return { content: "Photo too large to view.", isError: true };
  ctx.photosLeft -= 1;
  return {
    content: [
      { type: "text", text: `Photo of ${table} ${id}:` },
      { type: "image", source: { type: "base64", media_type: mt, data: file.bytes.toString("base64") } },
    ],
  };
}

async function showBill(i: Json, ctx: ToolContext): Promise<ToolOutcome> {
  const table = i.table === "closings" ? "closings" : "expenses";
  const id = String(i.id ?? "");
  if (!UUID.test(id)) return { content: "Invalid id.", isError: true };
  if (!driveFileId(await photoRow(table, id))) return { content: "This record has no photo.", isError: true };
  return show(ctx, { type: "bill", table, id, caption: str(i.caption)?.slice(0, 120) ?? undefined });
}

async function remember(i: Json): Promise<ToolOutcome> {
  const note = String(i.note ?? "").trim();
  if (!note) return { content: "Empty note.", isError: true };
  const db = createServiceClient();
  const { data, error } = await db
    .from("ai_memory")
    .insert({ scope: str(i.scope) ?? "general", subject: str(i.subject), note: note.slice(0, 1200), source: "ai" })
    .select("id")
    .single();
  if (error) return { content: error.message, isError: true };
  return { content: `Saved to memory (${(data as { id: string }).id}).` };
}

async function forget(i: Json): Promise<ToolOutcome> {
  const id = String(i.memory_id ?? "");
  if (!UUID.test(id)) return { content: "Invalid memory id.", isError: true };
  const db = createServiceClient();
  const { error } = await db.from("ai_memory").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { content: error.message, isError: true };
  return { content: "Memory retired." };
}

export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const i = (input ?? {}) as Json;
  try {
    switch (name) {
      case "query_db":
        return await queryDb(i);
      case "change_data":
        return await change(i, ctx, true);
      case "propose_change":
        return await change(i, ctx, false);
      case "flag_issue":
        return await flag(i, ctx);
      case "view_bill_photo":
        return await viewPhoto(i, ctx);
      case "show_bill":
        return await showBill(i, ctx);
      case "remember":
        return await remember(i);
      case "forget":
        return await forget(i);
      case "show_chart":
        return show(ctx, sanitizeChart(i));
      case "show_table":
        return show(ctx, sanitizeTable(i));
      case "show_stats":
        return show(ctx, sanitizeStats(i));
      case "suggest_followups": {
        const items = (Array.isArray(i.questions) ? i.questions : [])
          .map((q) => String(q ?? "").trim().slice(0, 100))
          .filter(Boolean)
          .slice(0, 3);
        if (!items.length) return { content: "No questions given." };
        return show(ctx, { type: "followups", items });
      }
      default:
        return { content: `Unknown tool ${name}.`, isError: true };
    }
  } catch (e) {
    return { content: e instanceof Error ? e.message : String(e), isError: true };
  }
}
