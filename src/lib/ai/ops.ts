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
  // Logos are images in Storage: only the logo actions change these.
  suppliers: { ops: ["update", "insert"], denyColumns: ["logo_path", "logo_source", "logo_updated_at", "logo_checked_at"] },
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
  stock_items: { ops: ["update", "insert"] },
};

const ALWAYS_DENY = new Set(["id", "created_at"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** "$milk": the id of the row an earlier insert in the same change created (that insert has ref "milk"). */
export const REF_NAME = /^\$[A-Za-z][\w-]{0,39}$/;

/** The table each link column points at (the foreign keys of the writable tables). */
export const LINKS: Record<string, string> = {
  inventory_item_id: "inventory_items",
  same_as: "inventory_items",
  supplier_id: "suppliers",
  category_id: "categories",
  expense_id: "expenses",
  menu_item_id: "menu_items",
  barista_id: "baristas",
  linked_barista_id: "baristas",
  location_id: "locations",
};
export function linkTable(table: string, column: string): string | null {
  if (column === "parent_id") return table === "categories" ? "categories" : null;
  return LINKS[column] ?? null;
}

export class OpError extends Error {}

/** The key a ref is known by: "$milk", or a made-up uuid (lower case) the model gave the insert as its id. */
function refToken(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  if (UUID.test(s)) return s.toLowerCase();
  const name = s.startsWith("$") ? s : `$${s}`;
  return REF_NAME.test(name) ? name : null;
}
const keyOf = (v: string) => (UUID.test(v) ? v.toLowerCase() : v);

export function validateOps(ops: unknown): Op[] {
  if (!Array.isArray(ops) || ops.length === 0) throw new OpError("No changes given.");
  if (ops.length > 60) throw new OpError("Too many changes in one action (max 60). Split it.");
  const defined = new Set<string>();
  const checkRefs = (i: number, cols: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(cols)) {
      if (typeof v === "string" && REF_NAME.test(v) && !defined.has(v)) {
        throw new OpError(`Op ${i + 1}: ${k} = "${v}" points at a new row, but no earlier insert in this change has "ref": "${v.slice(1)}".`);
      }
    }
  };
  const rowId = (i: number, raw: unknown, what: string): string => {
    const id = String(raw ?? "").trim();
    if (UUID.test(id) || defined.has(id)) return id;
    throw new OpError(`Op ${i + 1}: ${what} needs a valid row id (or the "$ref" of a row inserted earlier in this change).`);
  };
  return ops.map((raw, i) => {
    const o = raw as Record<string, unknown>;
    const table = String(o.table ?? "");
    const kind = String(o.op ?? "") as Kind;
    const policy = WRITE_POLICY[table];
    if (!policy) throw new OpError(`Op ${i + 1}: table "${table}" is not writable by the assistant.`);
    if (!policy.ops.includes(kind)) throw new OpError(`Op ${i + 1}: "${kind}" is not allowed on ${table}.`);
    const deny = new Set([...(policy.denyColumns ?? []), ...ALWAYS_DENY]);
    if (kind === "update") {
      const id = rowId(i, o.id, "update");
      const changes = (o.changes ?? {}) as Record<string, unknown>;
      const keys = Object.keys(changes);
      if (!keys.length) throw new OpError(`Op ${i + 1}: no columns to change.`);
      for (const k of keys) if (deny.has(k)) throw new OpError(`Op ${i + 1}: column "${k}" cannot be changed.`);
      checkRefs(i, changes);
      return { op: "update", table, id, changes };
    }
    if (kind === "insert") {
      const values = { ...((o.values ?? {}) as Record<string, unknown>) };
      for (const k of Object.keys(values)) if (deny.has(k) && k !== "id") throw new OpError(`Op ${i + 1}: column "${k}" cannot be set.`);
      // An id the model chose for a new row is never used as the real id; it becomes the row's ref instead.
      const ref = refToken(o.ref) ?? refToken(values.id);
      delete values.id;
      checkRefs(i, values);
      if (ref) {
        if (defined.has(ref)) throw new OpError(`Op ${i + 1}: ref "${ref}" is used by two inserts.`);
        defined.add(ref);
        return { op: "insert", table, values, ref };
      }
      return { op: "insert", table, values };
    }
    return { op: "delete", table, id: rowId(i, o.id, "delete") };
  });
}

/**
 * Checks that every row an op points at exists, before anything is saved or
 * applied. It also fixes the one mistake the model kept making (13 broken
 * fixes in October): making up an id for a row the same change creates —
 * "insert the item, link the bill line to a1b2c3d4-…". When exactly one
 * earlier insert in the change goes into the table the made-up id points at,
 * the id becomes that insert's ref and applyOps links the real row. Anything
 * else that points nowhere is an error the model, or the owner, can act on.
 */
export async function prepareOps(input: Op[]): Promise<Op[]> {
  const ops = input.map((o) => ({ ...o })) as Op[];
  const refs = new Set(ops.flatMap((o) => (o.op === "insert" && o.ref ? [o.ref] : [])));
  type Use = { i: number; field: string; table: string; id: string };
  const uses: Use[] = [];
  ops.forEach((o, i) => {
    if (o.op !== "insert") uses.push({ i, field: "id", table: o.table, id: o.id.toLowerCase() });
    const cols = o.op === "update" ? o.changes : o.op === "insert" ? o.values : {};
    for (const [k, v] of Object.entries(cols)) {
      const target = linkTable(o.table, k);
      if (target && typeof v === "string" && UUID.test(v)) uses.push({ i, field: k, table: target, id: v.toLowerCase() });
    }
  });
  const toCheck = uses.filter((u) => UUID.test(u.id) && !refs.has(u.id));
  if (!toCheck.length) return ops;

  const db = createServiceClient();
  const byTable = new Map<string, Set<string>>();
  for (const u of toCheck) {
    if (!byTable.has(u.table)) byTable.set(u.table, new Set());
    byTable.get(u.table)!.add(u.id);
  }
  const found = new Set<string>();
  await Promise.all(
    [...byTable.entries()].map(async ([table, ids]) => {
      const { data, error } = await db.from(table).select("id").in("id", [...ids]);
      if (error) throw new OpError(`${table}: ${error.message}`);
      for (const r of (data ?? []) as { id: string }[]) found.add(`${table}:${String(r.id).toLowerCase()}`);
    }),
  );
  const missing = toCheck.filter((u) => !found.has(`${u.table}:${u.id}`));
  if (!missing.length) return ops;

  // Bind a made-up id to the one insert it can only mean.
  const firstUse = new Map<string, Use>();
  for (const u of missing) if (!firstUse.has(u.id)) firstUse.set(u.id, u);
  const perTable = new Map<string, Use[]>();
  for (const u of firstUse.values()) perTable.set(u.table, [...(perTable.get(u.table) ?? []), u]);
  for (const [table, list] of perTable) {
    const inserts = ops.map((o, k) => ({ o, k })).filter(({ o, k }) => o.op === "insert" && o.table === table && !o.ref && k < list[0].i);
    if (list.length === 1 && inserts.length === 1) {
      (ops[inserts[0].k] as Extract<Op, { op: "insert" }>).ref = list[0].id;
      continue;
    }
    const u = list[0];
    throw new OpError(
      u.field === "id"
        ? `Op ${u.i + 1}: ${table} row ${u.id} not found.`
        : `Op ${u.i + 1}: ${u.field} ${u.id} is not an existing ${table} row. To point at a row this same change creates, give that insert "ref": "new_item" and write "$new_item" here. Never make up ids.`,
    );
  }
  return ops;
}

async function locationId(): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("locations").select("id").eq("is_active", true).limit(1).maybeSingle();
  return (data?.id as string) ?? null;
}

/**
 * Apply ops in order. Returns the before-state aligned with the ops, and the ops
 * as applied: inserts carry their new id, and every "$ref" (or made-up id bound
 * to an insert by prepareOps) is replaced by the real id of the row it means.
 */
export async function applyOps(input: Op[]): Promise<{ ops: Op[]; before: unknown[] }> {
  const db = createServiceClient();
  const ops: Op[] = [];
  const before: unknown[] = [];
  let loc: string | null | undefined;
  const real = new Map<string, string>();
  const swap = (v: unknown): unknown => (typeof v === "string" ? real.get(keyOf(v)) ?? v : v);
  const swapAll = (i: number, cols: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cols)) {
      out[k] = swap(v);
      if (typeof out[k] === "string" && REF_NAME.test(out[k] as string)) throw new OpError(`Op ${i + 1}: ${k} points at "${out[k]}", a row this change never created.`);
    }
    return out;
  };

  try {
    for (const [i, raw] of input.entries()) {
      const op: Op =
        raw.op === "insert"
          ? { ...raw, values: swapAll(i, raw.values) }
          : raw.op === "update"
            ? { ...raw, id: String(swap(raw.id)), changes: swapAll(i, raw.changes) }
            : { ...raw, id: String(swap(raw.id)) };
      if (op.op !== "insert" && !UUID.test(op.id)) throw new OpError(`Op ${i + 1}: ${op.id} is a row this change never created.`);
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
        if (op.ref) real.set(op.ref, id);
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

/** What the owner reads when a fix can't be applied (the raw error stays on the action). */
export function plainApplyError(message: string): string {
  if (/foreign key|is not an existing|never created/i.test(message)) {
    return "This fix points at a record that isn't there, so nothing was changed. Tell the AI what's right in a note and tap Redo — it will rebuild the fix.";
  }
  if (/not found/i.test(message)) return "A row this fix changes was removed or changed since, so nothing was changed. Redo it with a note, or dismiss it.";
  if (/duplicate key|unique constraint/i.test(message)) return "This fix would create a duplicate, so nothing was changed. Redo it with a note, or dismiss it.";
  return `Nothing was changed: ${message}`;
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
      const res = await applyOps(await prepareOps(validateOps(a.ops)));
      await db.from("ai_actions").update({ status: "applied", ops: res.ops, before: res.before, applied_at: now, decided_at: now, error: null }).eq("id", id);
      return { ok: true, status: "applied" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("ai_actions").update({ error: message }).eq("id", id);
      return { ok: false, error: plainApplyError(message) };
    }
  }

  // undo
  // A dismissal is undone by opening the item again (nothing was changed in the data).
  if (a.status === "rejected") {
    const back = a.ops?.length ? "proposed" : "info";
    await db.from("ai_actions").update({ status: back, decided_at: null }).eq("id", id);
    return { ok: true, status: back };
  }
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
