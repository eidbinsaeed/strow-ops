/**
 * The only door through which Strow AI changes data.
 *
 * - Every write is checked against WRITE_POLICY (Strow tables only; Personal
 *   Finance, audit log, owners and other projects are never writable).
 * - applyOps captures the before-state of every row it touches, so any action
 *   can be undone exactly. If one op fails, the ones already applied are
 *   rolled back.
 * - Every applied op is also written to audit_log (actor "system").
 */
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import type { Op } from "./types";

type Kind = Op["op"];

export const WRITE_POLICY: Record<string, { ops: Kind[]; denyColumns?: string[] }> = {
  closings: { ops: ["update", "insert"], denyColumns: ["grand_total", "over_short"] },
  expenses: { ops: ["update", "insert"] },
  expense_line_items: { ops: ["update", "insert", "delete"] },
  suppliers: { ops: ["update", "insert"] },
  categories: { ops: ["update", "insert"] },
  inventory_items: { ops: ["update", "insert"] },
  item_aliases: { ops: ["update", "insert", "delete"] },
  fixed_costs: { ops: ["update", "insert"] },
  liabilities: { ops: ["update", "insert"] },
  cash_events: { ops: ["insert"] },
  baristas: { ops: ["update"], denyColumns: ["pin_hash", "location_id"] },
  attendance_days: { ops: ["update", "insert"] },
  leave_requests: { ops: ["update"] },
  staff_reports: { ops: ["update", "insert"] },
  payroll_adjustments: { ops: ["update", "insert"] },
  menu_items: { ops: ["update", "insert"] },
  recipe_lines: { ops: ["update", "insert", "delete"] },
};

const ALWAYS_DENY = new Set(["id", "created_at"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OpError extends Error {}

export function validateOps(ops: unknown): Op[] {
  if (!Array.isArray(ops) || ops.length === 0) throw new OpError("No changes given.");
  if (ops.length > 60) throw new OpError("Too many changes in one action (max 60). Split it.");
  return ops.map((raw, i) => {
    const o = raw as Record<string, unknown>;
    const table = String(o.table ?? "");
    const kind = String(o.op ?? "") as Kind;
    const policy = WRITE_POLICY[table];
    if (!policy) throw new OpError(`Op ${i + 1}: table "${table}" is not writable by the assistant.`);
    if (!policy.ops.includes(kind)) throw new OpError(`Op ${i + 1}: "${kind}" is not allowed on ${table}.`);
    const deny = new Set([...(policy.denyColumns ?? []), ...ALWAYS_DENY]);
    if (kind === "update") {
      const id = String(o.id ?? "");
      if (!UUID.test(id)) throw new OpError(`Op ${i + 1}: update needs a valid row id.`);
      const changes = (o.changes ?? {}) as Record<string, unknown>;
      const keys = Object.keys(changes);
      if (!keys.length) throw new OpError(`Op ${i + 1}: no columns to change.`);
      for (const k of keys) if (deny.has(k)) throw new OpError(`Op ${i + 1}: column "${k}" cannot be changed.`);
      return { op: "update", table, id, changes };
    }
    if (kind === "insert") {
      const values = { ...((o.values ?? {}) as Record<string, unknown>) };
      for (const k of Object.keys(values)) if (deny.has(k) && k !== "id") throw new OpError(`Op ${i + 1}: column "${k}" cannot be set.`);
      delete values.id;
      return { op: "insert", table, values };
    }
    const id = String(o.id ?? "");
    if (!UUID.test(id)) throw new OpError(`Op ${i + 1}: delete needs a valid row id.`);
    return { op: "delete", table, id };
  });
}

async function locationId(): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("locations").select("id").eq("is_active", true).limit(1).maybeSingle();
  return (data?.id as string) ?? null;
}

/** Apply ops in order. Returns the before-state aligned with the ops (and ops with inserted ids). */
export async function applyOps(input: Op[]): Promise<{ ops: Op[]; before: unknown[] }> {
  const db = createServiceClient();
  const ops: Op[] = [];
  const before: unknown[] = [];
  let loc: string | null | undefined;

  try {
    for (const op of input) {
      if (op.op === "update") {
        const cols = Object.keys(op.changes);
        const { data: row, error: readErr } = await db.from(op.table).select(cols.join(",")).eq("id", op.id).maybeSingle();
        if (readErr) throw new OpError(`${op.table}: ${readErr.message}`);
        if (!row) throw new OpError(`${op.table}: row ${op.id} not found.`);
        const { error } = await db.from(op.table).update(op.changes).eq("id", op.id);
        if (error) throw new OpError(`${op.table}: ${error.message}`);
        ops.push(op);
        before.push(row);
        await writeAudit({ actor_id: null, actor_type: "system", action: "ai_updated", entity_type: op.table, entity_id: op.id, before_state: row as unknown as Record<string, unknown>, after_state: op.changes });
      } else if (op.op === "insert") {
        const values = { ...op.values };
        if (!("location_id" in values) && ["closings", "expenses", "suppliers", "inventory_items", "item_aliases", "fixed_costs", "liabilities", "cash_events", "menu_items"].includes(op.table)) {
          if (loc === undefined) loc = await locationId();
          if (loc) values.location_id = loc;
        }
        const { data, error } = await db.from(op.table).insert(values).select("id").single();
        if (error) throw new OpError(`${op.table}: ${error.message}`);
        const id = (data as { id: string }).id;
        ops.push({ ...op, values, id });
        before.push(null);
        await writeAudit({ actor_id: null, actor_type: "system", action: "ai_created", entity_type: op.table, entity_id: id, after_state: values });
      } else {
        const { data: row, error: readErr } = await db.from(op.table).select("*").eq("id", op.id).maybeSingle();
        if (readErr) throw new OpError(`${op.table}: ${readErr.message}`);
        if (!row) throw new OpError(`${op.table}: row ${op.id} not found.`);
        const { error } = await db.from(op.table).delete().eq("id", op.id);
        if (error) throw new OpError(`${op.table}: ${error.message}`);
        ops.push(op);
        before.push(row);
        await writeAudit({ actor_id: null, actor_type: "system", action: "ai_deleted", entity_type: op.table, entity_id: op.id, before_state: row as unknown as Record<string, unknown> });
      }
    }
  } catch (e) {
    // Roll back whatever already went through, newest first.
    try {
      await revertOps(ops, before);
    } catch {
      /* best effort */
    }
    throw e;
  }
  return { ops, before };
}

/** Undo: reverse order, restore exactly what was there before. */
export async function revertOps(ops: Op[], before: unknown[]): Promise<void> {
  const db = createServiceClient();
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    const prev = (before?.[i] ?? null) as Record<string, unknown> | null;
    if (op.op === "update") {
      if (!prev) continue;
      const restore: Record<string, unknown> = {};
      for (const k of Object.keys(op.changes)) if (k in prev) restore[k] = prev[k];
      const { error } = await db.from(op.table).update(restore).eq("id", op.id);
      if (error) throw new OpError(`Undo ${op.table}: ${error.message}`);
      await writeAudit({ actor_id: null, actor_type: "owner", action: "ai_undone", entity_type: op.table, entity_id: op.id, before_state: op.changes, after_state: restore });
    } else if (op.op === "insert") {
      if (!op.id) continue;
      const { error } = await db.from(op.table).delete().eq("id", op.id);
      if (error) throw new OpError(`Undo ${op.table}: ${error.message}`);
      await writeAudit({ actor_id: null, actor_type: "owner", action: "ai_undone", entity_type: op.table, entity_id: op.id, before_state: op.values });
    } else {
      if (!prev) continue;
      const { error } = await db.from(op.table).insert(prev);
      if (error) throw new OpError(`Undo ${op.table}: ${error.message}`);
      await writeAudit({ actor_id: null, actor_type: "owner", action: "ai_undone", entity_type: op.table, entity_id: op.id, after_state: prev });
    }
  }
}

/** Record + (optionally) apply an AI action. */
export async function recordAction(args: {
  source: "chat" | "autopilot";
  title: string;
  detail?: string;
  confidence?: number | null;
  severity?: "info" | "warn" | "critical";
  ops?: Op[];
  apply: boolean;
  entityTable?: string | null;
  entityId?: string | null;
  runId?: string | null;
  chatId?: string | null;
  status?: "info";
}): Promise<{ id: string; status: string; error?: string }> {
  const db = createServiceClient();
  const base = {
    source: args.source,
    title: args.title.slice(0, 200),
    detail: args.detail ?? null,
    confidence: args.confidence ?? null,
    severity: args.severity ?? "info",
    entity_table: args.entityTable ?? null,
    entity_id: args.entityId && UUID.test(args.entityId) ? args.entityId : null,
    run_id: args.runId ?? null,
    chat_id: args.chatId ?? null,
  };

  if (args.status === "info" || !args.ops?.length) {
    const { data, error } = await db
      .from("ai_actions")
      .insert({ ...base, status: args.status === "info" ? "info" : "proposed", ops: args.ops ?? [] })
      .select("id")
      .single();
    if (error) throw new OpError(error.message);
    return { id: (data as { id: string }).id, status: args.status === "info" ? "info" : "proposed" };
  }

  if (!args.apply) {
    const { data, error } = await db.from("ai_actions").insert({ ...base, status: "proposed", ops: args.ops }).select("id").single();
    if (error) throw new OpError(error.message);
    return { id: (data as { id: string }).id, status: "proposed" };
  }

  try {
    const res = await applyOps(args.ops);
    const { data, error } = await db
      .from("ai_actions")
      .insert({ ...base, status: "applied", ops: res.ops, before: res.before, applied_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) throw new OpError(error.message);
    return { id: (data as { id: string }).id, status: "applied" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const { data } = await db.from("ai_actions").insert({ ...base, status: "failed", ops: args.ops, error: message }).select("id").single();
    return { id: (data as { id: string } | null)?.id ?? "", status: "failed", error: message };
  }
}

/** Owner decisions on an existing action. */
export async function decideAction(id: string, decision: "approve" | "reject" | "undo"): Promise<{ ok: boolean; error?: string; status?: string }> {
  const db = createServiceClient();
  const { data: row, error } = await db.from("ai_actions").select("*").eq("id", id).maybeSingle();
  if (error || !row) return { ok: false, error: "Action not found" };
  const a = row as { status: string; ops: Op[]; before: unknown[] | null };
  const now = new Date().toISOString();

  if (decision === "reject") {
    if (a.status !== "proposed" && a.status !== "info") return { ok: false, error: "Only open items can be dismissed" };
    await db.from("ai_actions").update({ status: "rejected", decided_at: now }).eq("id", id);
    return { ok: true, status: "rejected" };
  }

  if (decision === "approve") {
    if (a.status !== "proposed") return { ok: false, error: "Nothing to approve" };
    if (!a.ops?.length) return { ok: false, error: "This one needs the AI to re-check — tap Ask AI" };
    try {
      const res = await applyOps(validateOps(a.ops));
      await db.from("ai_actions").update({ status: "applied", ops: res.ops, before: res.before, applied_at: now, decided_at: now, error: null }).eq("id", id);
      return { ok: true, status: "applied" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("ai_actions").update({ error: message }).eq("id", id);
      return { ok: false, error: message };
    }
  }

  // undo
  if (a.status !== "applied") return { ok: false, error: "Only applied changes can be undone" };
  try {
    await revertOps(a.ops ?? [], a.before ?? []);
    await db.from("ai_actions").update({ status: "undone", undone_at: now, decided_at: now }).eq("id", id);
    return { ok: true, status: "undone" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Close an open proposal/alert once it has been fixed or confirmed fine. */
export async function closeOpenItem(id: string, note?: string | null): Promise<{ title: string } | null> {
  const db = createServiceClient();
  const { data: row } = await db.from("ai_actions").select("id, title, detail, status").eq("id", id).maybeSingle();
  const r = row as { id: string; title: string; detail: string | null; status: string } | null;
  if (!r || !["proposed", "info"].includes(r.status)) return null;
  const detail = note ? `${r.detail ? r.detail + " — " : ""}Resolved: ${note}` : r.detail;
  const { data: done } = await db
    .from("ai_actions")
    .update({ status: "resolved", decided_at: new Date().toISOString(), detail })
    .eq("id", id)
    .in("status", ["proposed", "info"])
    .select("id");
  return done && done.length ? { title: r.title } : null;
}
