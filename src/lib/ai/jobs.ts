/**
 * Strow AI in the background.
 *
 * Every AI run is a row in ai_jobs (migration 0032). The server works on it
 * after the web request has answered, saves its steps and blocks as it goes,
 * and writes the finished answer to the chat. No screen has to stay open:
 * any screen can show a running job, and the owner can leave and come back.
 *
 *   chat job   one message in Strow AI. Starts at once, in the request that
 *              received it (startChatJob + runJob).
 *   item job   one Needs-you item handed to the AI ("Let the AI handle all",
 *              startBatch). Item jobs wait in a queue and run one after
 *              another: one server run per job (a function lives 300 s), and
 *              when it ends the database calls the app to start the next
 *              (kickNext → ai_kick_worker → POST /api/ai/jobs/work).
 *
 * Safety nets: a running job touches heartbeat_at every few seconds; one
 * whose heartbeat stopped was cut off and is closed as interrupted, with what
 * it had done so far (reapStaleJobs). Any open owner screen notices a queue
 * that stands still and starts it again.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcastLive } from "@/lib/live";
import { sendPush } from "@/lib/push";
import { getSettings } from "@/lib/settings";
import { buildSystemPrompt } from "./prompt";
import { MODELS, runAgent } from "./agent";
import { closeOpenItem } from "./ops";
import { FINANCE_TOOLS, buildFinancePrompt, executeFinanceTool } from "./finance";
import type { ToolContext } from "./tools";
import { applyStepEvent, stepsBlock, visibleSteps } from "./steps";
import type { Block, Step, StreamEvent } from "./types";
import { countsLine, emptyCounts, type BatchCounts, type ChatLive, type JobOutcome, type JobStatus, type JobsStatus, type LiveJob, type SavedMessage } from "./job-types";

type Db = ReturnType<typeof createServiceClient>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A running job with no heartbeat for this long was cut off. */
export const STALE_SECONDS = 75;
/** Heartbeat, and how fast a tap on Stop is noticed. */
const HEARTBEAT_MS = 3_000;
/** Progress is saved at most this often. */
const FLUSH_MS = 700;
/**
 * One server run lives 300 s: no new step after SOFT, the request in flight is dropped at HARD, the rest is for
 * saving and handing over. (The two env overrides exist for tests and for a host with another limit.)
 */
const SOFT_MS = Number(process.env.STROW_AI_SOFT_MS) || 235_000;
const HARD_MS = Number(process.env.STROW_AI_HARD_MS) || 262_000;
/** How long after its start a server run may still be handing over to the next one. */
export const RUN_MS = 294_000;
/** Items handed over in one go: the list Needs you shows. */
export const MAX_BATCH = 60;

export type JobRow = {
  id: string;
  created_at: string;
  kind: "chat" | "item";
  mode: "chat" | "finance";
  status: JobStatus;
  chat_id: string | null;
  batch_id: string | null;
  action_id: string | null;
  position: number;
  title: string | null;
  prompt: string;
  page: string | null;
  cancel_requested: boolean;
  started_at: string | null;
  heartbeat_at: string | null;
  finished_at: string | null;
  status_text: string | null;
  steps: Step[];
  blocks: Block[];
  outcome: string | null;
  summary: string | null;
  error: string | null;
  model: string | null;
  stats: Record<string, unknown>;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Filters travel in the request address, which has a size limit: long id lists go in pieces. */
function pieces<T>(list: T[], size = 80): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
const cutoffIso = () => new Date(Date.now() - STALE_SECONDS * 1000).toISOString();
const isStale = (j: { heartbeat_at: string | null; started_at: string | null; created_at: string }) =>
  Date.parse(j.heartbeat_at ?? j.started_at ?? j.created_at) < Date.now() - STALE_SECONDS * 1000;

// ---------------------------------------------------------------------------
// Text helpers (moved here from the chat route)
// ---------------------------------------------------------------------------

/** What a saved answer contributes to the model's history of the chat. */
export function summarize(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "text":
          return b.text;
        case "chart":
          // A record of a tool call, NOT answer text. Worded so the model doesn't copy it
          // instead of calling show_chart (it did with the old "[Chart shown: …]" note).
          return `(note: earlier I called the show_chart tool — "${b.title}"; data ${b.labels
            .slice(0, 24)
            .map((l, i) => `${l}=${b.series.map((s) => s.values[i]).join("/")}`)
            .join("; ")})`;
        case "table":
          return `(note: earlier I called the show_table tool — "${b.title ?? ""}", ${b.rows.length} rows)`;
        case "stats":
          return `(note: earlier I called the show_stats tool — ${b.items.map((i) => `${i.label} ${i.value}`).join("; ")})`;
        case "action":
          return `[Change ${b.status}: ${b.title} (action ${b.id})]`;
        case "bill":
          return `[Bill photo shown: ${b.table} ${b.id}]`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 1800);
}

export function friendly(msg: string): string {
  if (/credit balance|billing|quota|insufficient/i.test(msg)) return "The AI account is out of credit — top up the Anthropic API balance and try again.";
  if (/api[_ ]?key|authentication|401|not set/i.test(msg)) return "The AI key isn't configured on the server.";
  if (/overloaded|529|rate/i.test(msg)) return "The AI is busy right now — try again in a minute.";
  return "Something went wrong: " + msg.slice(0, 200);
}

function mergeRoles(list: { role: "user" | "assistant"; content: string }[]): MessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of list) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else out.push({ ...m });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** The Needs-you item a message is about ("… (open item <id>; …)"). */
export function openItemOf(message: string): string | null {
  return /open item ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(message)?.[1] ?? null;
}

/** The AI's written answer in a few lines, for the item's card on Needs you. */
function summaryOf(blocks: Block[], text: string): string | null {
  const written =
    text.trim() ||
    blocks
      .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join(" ");
  const clean = written.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 600) : null;
}

// ---------------------------------------------------------------------------
// Who may start the worker
// ---------------------------------------------------------------------------

/** Derived from a server-only secret: nothing to configure, nothing stored. */
export function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SESSION_JWT_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update("strow-ai-worker-v1").digest("hex");
}

/** True for the call the database makes to hand over the next job. */
export function isWorkerRequest(req: Request): boolean {
  const got = req.headers.get("x-strow-worker") ?? "";
  const want = workerToken();
  if (!got || !want) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The address this app was reached at (https://www.strow.app), for the hand-over call.
 * Behind the host's proxy the public name is in the forwarded headers; req.url is the fallback.
 */
export function originOf(req: Request): string {
  const fixed = process.env.STROW_APP_URL?.trim();
  if (fixed) return fixed.replace(/\/+$/, "");
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{2,5})?$/.test(host)) {
    const local = /^(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(host);
    return `${local ? "http" : "https"}://${host}`;
  }
  return new URL(req.url).origin;
}

// ---------------------------------------------------------------------------
// Starting a chat job
// ---------------------------------------------------------------------------

export type StartedChat =
  | { ok: true; chatId: string; jobId: string; userMessageId: string | null; at: string; attached: boolean; job: JobRow | null }
  | { ok: false; status: number; error: string };

/**
 * One message in Strow AI becomes a job that is already "running": the caller
 * works on it right after answering the request (after(() => runJob(job))).
 * A message about a Needs-you item the AI is already on joins that run.
 */
export async function startChatJob(args: { chatId: string | null; message: string; page: string; finance: boolean }): Promise<StartedChat> {
  const db = createServiceClient();
  let chatId = args.chatId && UUID.test(args.chatId) ? args.chatId : null;
  if (chatId) {
    const { data } = await db.from("ai_chats").select("id").eq("id", chatId).maybeSingle();
    if (!data) chatId = null;
  }

  const openItem = openItemOf(args.message);
  if (openItem) {
    const { data } = await db
      .from("ai_jobs")
      .select("id, chat_id, status, heartbeat_at, started_at, created_at")
      .eq("action_id", openItem)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(5);
    const busy = ((data ?? []) as { id: string; chat_id: string | null; status: string; heartbeat_at: string | null; started_at: string | null; created_at: string }[]).find(
      (j) => j.chat_id && (j.status === "queued" || !isStale(j)),
    );
    if (busy?.chat_id) {
      return { ok: true, chatId: busy.chat_id, jobId: busy.id, userMessageId: null, at: new Date().toISOString(), attached: true, job: null };
    }
  }

  if (chatId) {
    const { data } = await db.from("ai_jobs").select("id, status, heartbeat_at, started_at, created_at").eq("chat_id", chatId).in("status", ["queued", "running"]).limit(10);
    const live = ((data ?? []) as { id: string; status: string; heartbeat_at: string | null; started_at: string | null; created_at: string }[]).filter((j) => j.status === "queued" || !isStale(j));
    if (live.length) return { ok: false, status: 409, error: "Still working on the last message — wait for it to finish, or tap Stop." };
  }

  if (!chatId) {
    const fix = /^Look into this and fix it if you can:\s*"([^"]+)"/i.exec(args.message);
    const { data, error } = await db
      .from("ai_chats")
      .insert({ title: ((args.finance ? "[مالية] " : "") + (fix ? `Fix: ${fix[1]}` : args.message)).slice(0, 80) })
      .select("id")
      .single();
    if (error || !data) return { ok: false, status: 500, error: error?.message ?? "Could not start chat" };
    chatId = (data as { id: string }).id;
  }

  const now = new Date().toISOString();
  const { data: jobRow, error: jobErr } = await db
    .from("ai_jobs")
    .insert({
      kind: "chat",
      mode: args.finance ? "finance" : "chat",
      status: "running",
      chat_id: chatId,
      action_id: openItem,
      prompt: args.message,
      page: args.page || null,
      started_at: now,
      heartbeat_at: now,
    })
    .select("*")
    .single();
  if (jobErr || !jobRow) return { ok: false, status: 500, error: jobErr?.message ?? "Could not start the AI" };
  const job = jobRow as JobRow;

  const { data: msg, error: msgErr } = await db
    .from("ai_messages")
    .insert({ chat_id: chatId, role: "user", blocks: [{ type: "text", text: args.message }], text: args.message })
    .select("id, created_at")
    .single();
  if (msgErr || !msg) {
    await db.from("ai_jobs").update({ status: "failed", finished_at: new Date().toISOString(), error: msgErr?.message ?? "Could not save the message" }).eq("id", job.id);
    return { ok: false, status: 500, error: msgErr?.message ?? "Could not save the message" };
  }
  const m = msg as { id: string; created_at: string };
  return { ok: true, chatId, jobId: job.id, userMessageId: m.id, at: m.created_at, attached: false, job };
}

// ---------------------------------------------------------------------------
// Working on a job
// ---------------------------------------------------------------------------

async function historyFor(db: Db, job: JobRow): Promise<{ role: "user" | "assistant"; content: string }[]> {
  // An item handed over with the whole list stands on its own: no chat history.
  if (job.kind === "item" || !job.chat_id) return [];
  const { data } = await db.from("ai_messages").select("role, text").eq("chat_id", job.chat_id).order("created_at", { ascending: false }).limit(11);
  const rows = ((data ?? []) as { role: "user" | "assistant"; text: string | null }[]).reverse().filter((m) => m.text && m.text.trim());
  // The newest one is this job's own question.
  const last = rows[rows.length - 1];
  if (last && last.role === "user" && last.text === job.prompt) rows.pop();
  return rows.slice(-10).map((m) => ({ role: m.role, content: m.text as string }));
}

async function isOpenItem(db: Db, id: string): Promise<boolean> {
  const { data } = await db.from("ai_actions").select("status").eq("id", id).maybeSingle();
  const s = (data as { status?: string } | null)?.status;
  return s === "proposed" || s === "info";
}

/** How a queued job's server run was started: with the hand-over itself, by the database's call, by the app calling itself, or by an open screen. */
export type StartedVia = "start" | "db" | "app" | "screen";

/**
 * Runs one job to the end and saves the answer. Never throws.
 * t0 = when this server run started (the time budget counts from there).
 */
export async function runJob(job: JobRow, t0: number = Date.now(), via?: StartedVia): Promise<void> {
  const db = createServiceClient();
  const began = Date.now();
  const finance = job.mode === "finance";
  let steps: Step[] = [];
  let statusText: string | null = null;
  /** Why the run was stopped from outside: Stop tapped, out of time, or the job is gone (closed or deleted elsewhere). */
  let stop: "cancel" | "time" | "gone" | null = null;
  const ctrl = new AbortController();
  const halt = (why: "cancel" | "time" | "gone") => {
    if (!stop) stop = why;
    ctrl.abort();
  };

  // ---- Saved progress: one write at a time, the newest state wins. Every write is also the heartbeat and the Stop check.
  let closed = false;
  let dirty = false;
  let busy = false;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const emit = (e: StreamEvent) => {
    if (e.t === "status") {
      statusText = e.text;
      steps = applyStepEvent(steps, e);
    } else if (e.t === "note") {
      steps = applyStepEvent(steps, e);
    }
    dirty = true;
    pump();
  };
  const ctx: ToolContext = { mode: "chat", chatId: job.chat_id, emit, blocks: [], photosLeft: 3, actions: [] };

  const save = async (full: boolean) => {
    const patch: Record<string, unknown> = { heartbeat_at: new Date().toISOString() };
    if (full) Object.assign(patch, { steps: visibleSteps(steps), blocks: ctx.blocks, status_text: statusText });
    const { data, error } = await db.from("ai_jobs").update(patch).eq("id", job.id).eq("status", "running").select("cancel_requested");
    if (error) {
      if (full) dirty = true; // try again with the next write
      return;
    }
    const row = (data ?? [])[0] as { cancel_requested: boolean } | undefined;
    if (!row) halt("gone");
    else if (row.cancel_requested) halt("cancel");
  };
  function pump() {
    if (closed || busy) return;
    busy = true;
    timer = setTimeout(
      () => {
        timer = null;
        const full = dirty;
        dirty = false;
        inFlight = save(full)
          .catch(() => {})
          .finally(() => {
            last = Date.now();
            busy = false;
            if (dirty && !closed) pump();
          });
      },
      Math.max(0, FLUSH_MS - (Date.now() - last)),
    );
  }
  const beat = setInterval(pump, HEARTBEAT_MS);
  const hard = setTimeout(() => halt("time"), Math.max(1_000, t0 + HARD_MS - Date.now()));

  let status: "done" | "failed" | "canceled" = "done";
  let error: string | null = null;
  let resultText = "";
  let model: string | null = null;
  let stepsUsed = 0;

  try {
    emit({ t: "status", text: "Thinking" });
    const [settings, system, history] = await Promise.all([getSettings(), finance ? buildFinancePrompt() : buildSystemPrompt("chat"), historyFor(db, job)]);
    const messages = mergeRoles([...history, { role: "user", content: job.prompt + (job.page ? `\n\n(The owner is on the page ${job.page}.)` : "") }]);
    const res = await runAgent({
      system,
      messages,
      ctx,
      maxSteps: 12,
      deadline: t0 + SOFT_MS,
      signal: ctrl.signal,
      model: settings.aiDeep ? MODELS.deep : MODELS.standard,
      usageSource: finance ? "finance" : job.kind === "item" ? "handover" : "chat",
      ...(finance ? { tools: FINANCE_TOOLS, execute: executeFinanceTool } : {}),
    });
    resultText = res.text;
    model = res.model;
    stepsUsed = res.steps;
  } catch (e) {
    if (!stop) {
      status = "failed";
      error = friendly(e instanceof Error ? e.message : String(e));
    }
  }

  // The progress writer stops before the answer is saved, so an old write can't land on top of it.
  closed = true;
  clearInterval(beat);
  clearTimeout(hard);
  if (timer) clearTimeout(timer);
  await inFlight.catch(() => {});

  try {
    // Closed or deleted from outside while it ran (its chat was deleted, or it was closed as interrupted): nothing to save.
    if (stop === "gone") return;

    // A run about a Needs-you item: once a fix landed, take the item off the list.
    const openItem = job.action_id ?? openItemOf(job.prompt);
    const applied = ctx.actions.filter((a) => a.status === "applied").length;
    let outcome: JobOutcome | null = null;
    if (openItem) {
      try {
        if (!(ctx.resolved ?? []).includes(openItem) && applied > 0) {
          const done = await closeOpenItem(openItem, "fixed in chat");
          if (done) ctx.blocks.push({ type: "action", id: openItem, title: done.title, detail: "Closed — the fix above resolved it.", status: "resolved", opsCount: 0 });
        }
        const stillOpen = await isOpenItem(db, openItem);
        const waiting = ctx.actions.some((a) => a.status === "proposed" || a.status === "info");
        outcome = !stillOpen && !waiting ? (applied > 0 ? "fixed" : "closed") : stop === "cancel" ? "canceled" : status === "failed" ? "failed" : "needs_you";
      } catch {
        outcome = stop === "cancel" ? "canceled" : status === "failed" ? "failed" : "needs_you";
      }
    }

    if (status === "failed") {
      ctx.blocks.push({ type: "text", text: "⚠️ " + error });
    } else if (stop === "cancel") {
      status = "canceled";
      ctx.blocks.push({ type: "text", text: "Stopped." });
    } else if (stop === "time") {
      ctx.blocks.push({
        type: "text",
        text: job.kind === "item" ? "I ran out of time on this one and stopped here. Open it on Needs you and ask again, and I'll carry on." : "I ran out of time and stopped here — say “continue” and I'll carry on.",
      });
    } else if (!ctx.blocks.some((b) => b.type !== "followups")) {
      ctx.blocks.push({ type: "text", text: resultText || "I could not finish a written answer this time. Ask again, or ask for a smaller piece, and I will pick it up." });
    }

    const sb = stepsBlock(steps, (Date.now() - began) / 1000);
    const blocks: Block[] = sb ? [sb, ...ctx.blocks] : ctx.blocks;
    const args = {
      p_id: job.id,
      p_status: status,
      p_blocks: blocks,
      p_text: summarize(ctx.blocks),
      p_steps: visibleSteps(steps),
      p_outcome: outcome,
      p_summary: summaryOf(ctx.blocks, resultText),
      p_error: error,
      p_stats: {
        applied,
        proposed: ctx.actions.filter((a) => a.status === "proposed").length,
        flagged: ctx.actions.filter((a) => a.status === "info").length,
        steps: stepsUsed,
        seconds: Math.round((Date.now() - began) / 1000),
        ...(via ? { via } : {}),
      },
      p_model: model,
    };
    let fin = await db.rpc("ai_finish_job", args);
    if (fin.error) {
      await sleep(1000);
      fin = await db.rpc("ai_finish_job", args);
    }
    if (fin.error) console.error("[strow-ai] could not save a finished job:", fin.error.message);

    await broadcastLive({ t: "ai_jobs", id: job.id });
    if (job.batch_id) await finishBatchIfDone(job.batch_id);
  } catch (e) {
    console.error("[strow-ai] job", job.id, "did not close cleanly:", e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------------------
// The queue: claim, hand over, clean up
// ---------------------------------------------------------------------------

/** Takes the next waiting item job when the lane is free. */
export async function claimNextJob(): Promise<JobRow | null> {
  const { data, error } = await createServiceClient().rpc("ai_claim_job", { p_stale_seconds: STALE_SECONDS });
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as JobRow[];
  return rows[0] ?? null;
}

async function laneState(db: Db): Promise<{ queued: number; running: boolean }> {
  const [q, r] = await Promise.all([
    db.from("ai_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
    db.from("ai_jobs").select("id", { count: "exact", head: true }).eq("status", "running").eq("kind", "item").gt("heartbeat_at", cutoffIso()),
  ]);
  return { queued: q.count ?? 0, running: (r.count ?? 0) > 0 };
}

/** The app calling itself. Only the fallback: on Vercel a function that keeps calling itself is stopped after a few rounds. */
async function directKick(origin: string): Promise<boolean> {
  const token = workerToken();
  if (!token) return false;
  try {
    const headers: Record<string, string> = { "content-type": "application/json", "x-strow-worker": token };
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const r = await fetch(`${origin}/api/ai/jobs/work`, { method: "POST", headers, body: '{"from":"app"}', cache: "no-store", signal: AbortSignal.timeout(8_000) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * After a queued job ends: start a fresh server run for the next one, and
 * make sure it really started. The database makes the call (ai_kick_worker);
 * if that doesn't land, the app calls itself; then it checks and tries again.
 */
export async function kickNext(origin: string, until: number = Date.now() + 30_000): Promise<void> {
  const db = createServiceClient();
  const token = workerToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    // `until` = when this server run ends: no attempt is started that it couldn't see through.
    if (attempt > 0 && Date.now() > until - 9_000) return;
    try {
      const lane = await laneState(db);
      if (!lane.queued || lane.running) return;
      let landed = false;
      if (token) {
        const { data, error } = await db.rpc("ai_kick_worker", { p_origin: origin, p_token: token });
        landed = !error && typeof data === "number" && data >= 200 && data < 300;
        if (!landed) console.warn("[strow-ai] the database's hand-over call did not land:", error?.message ?? `HTTP ${data ?? "no answer"}`, "→", origin);
      }
      if (!landed) landed = await directKick(origin);
      await sleep(landed ? 1_200 : 2_000 + attempt * 2_000);
    } catch (e) {
      console.warn("[strow-ai] hand-over attempt failed:", e instanceof Error ? e.message : e);
      await sleep(2_000);
    }
  }
}

/**
 * Closes a run from outside, with the progress it had saved, but only if its heartbeat is older than
 * `staleBefore` (its server run is gone). Returns whether this call closed it.
 */
async function closeDeadJob(db: Db, j: JobRow, how: "interrupted" | "stopped", staleBefore: string): Promise<boolean> {
  const items = Array.isArray(j.steps) ? j.steps : [];
  const saved = Array.isArray(j.blocks) ? j.blocks : [];
  const seconds = j.started_at && j.heartbeat_at ? Math.max(0, Math.round((Date.parse(j.heartbeat_at) - Date.parse(j.started_at)) / 1000)) : 0;
  const tail: Block = {
    type: "text",
    text: how === "stopped" ? "Stopped." : "⚠️ This run was cut off before it finished. Any change listed above was saved and can be undone. Ask again and I'll carry on.",
  };
  const body: Block[] = [...saved, tail];
  const blocks: Block[] = items.length ? [{ type: "steps", items, seconds }, ...body] : body;
  const { data: ok, error } = await db.rpc("ai_finish_job", {
    p_id: j.id,
    p_status: how === "stopped" ? "canceled" : "failed",
    p_blocks: blocks,
    p_text: summarize(body),
    p_outcome: j.action_id ? (how === "stopped" ? "canceled" : "failed") : null,
    p_error: how === "stopped" ? null : "interrupted",
    p_stale_before: staleBefore,
  });
  if (error || !ok) return false;
  if (j.batch_id) await finishBatchIfDone(j.batch_id).catch(() => {});
  return true;
}

/** Closes runs that were cut off (no heartbeat), keeping what they had done so far. Returns how many. */
export async function reapStaleJobs(): Promise<number> {
  const db = createServiceClient();
  const cutoff = cutoffIso();
  const { data } = await db.from("ai_jobs").select("*").eq("status", "running").lt("heartbeat_at", cutoff).limit(10);
  let n = 0;
  for (const j of (data ?? []) as JobRow[]) if (await closeDeadJob(db, j, "interrupted", cutoff)) n++;
  if (n) await broadcastLive({ t: "ai_jobs" });
  return n;
}

async function batchCounts(db: Db, batchId: string): Promise<BatchCounts> {
  const { data } = await db.from("ai_jobs").select("status, outcome, stats").eq("batch_id", batchId).limit(500);
  const c = emptyCounts();
  for (const j of (data ?? []) as { status: string; outcome: string | null; stats: { applied?: number } | null }[]) {
    c.changes += Number(j.stats?.applied ?? 0) || 0;
    if (j.outcome === "fixed") c.fixed++;
    else if (j.outcome === "closed") c.closed++;
    else if (j.status === "canceled" || j.outcome === "canceled") c.canceled++;
    else if (j.status === "failed" || j.outcome === "failed") c.failed++;
    else if (j.status === "done") c.needsYou++;
  }
  return c;
}

/** When the last job of a hand-over ends: one closing message in its chat and one notification. Runs once per hand-over. */
export async function finishBatchIfDone(batchId: string): Promise<void> {
  const db = createServiceClient();
  const { count } = await db.from("ai_jobs").select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("status", ["queued", "running"]);
  if (count) return;
  const { data: won } = await db.from("ai_batches").update({ finished_at: new Date().toISOString() }).eq("id", batchId).is("finished_at", null).select("id, chat_id, total");
  const b = ((won ?? []) as { id: string; chat_id: string | null; total: number }[])[0];
  if (!b) return;

  const c = await batchCounts(db, batchId);
  const handled = c.fixed + c.closed + c.needsYou + c.failed;
  const parts: string[] = [];
  if (c.fixed) parts.push(`${c.fixed} fixed${c.changes ? ` (${c.changes === 1 ? "1 change, with Undo" : `${c.changes} changes, each with Undo`})` : ""}`);
  if (c.closed) parts.push(`${c.closed} closed with nothing to change`);
  if (c.needsYou) parts.push(`${c.needsYou} still need${c.needsYou === 1 ? "s" : ""} you — on Needs you, with what I found`);
  if (c.failed) parts.push(`${c.failed} I couldn't finish — still on Needs you`);
  if (c.canceled) parts.push(`${c.canceled} not started (stopped)`);
  const text = c.canceled && !handled ? "Stopped before anything was done." : `${c.canceled ? "Stopped." : `That's the whole list (${b.total}).`} ${parts.join("; ")}.`;
  await db.from("ai_batches").update({ summary: text }).eq("id", batchId);

  if (b.chat_id) {
    const items = [
      { label: "Fixed", value: String(c.fixed), ...(c.changes ? { hint: `${c.changes} change${c.changes === 1 ? "" : "s"}`, tone: "good" as const } : {}) },
      { label: "Nothing to change", value: String(c.closed) },
      { label: "Still need you", value: String(c.needsYou + c.failed), ...(c.needsYou + c.failed ? { hint: "on Needs you", tone: "bad" as const } : {}) },
      ...(c.canceled ? [{ label: "Not started", value: String(c.canceled) }] : []),
    ];
    const blocks: Block[] = [{ type: "stats", items }, { type: "text", text }];
    await db.from("ai_messages").insert({ chat_id: b.chat_id, role: "assistant", blocks, text });
    await db.from("ai_chats").update({ updated_at: new Date().toISOString() }).eq("id", b.chat_id);
  }

  await sendPush({
    title: c.canceled && !handled ? "Strow AI stopped" : "Strow AI finished your list",
    body: countsLine(c),
    url: c.needsYou + c.failed > 0 ? "/owner/needs-you" : b.chat_id ? `/owner/assistant?c=${b.chat_id}` : "/owner/needs-you",
    tag: `ai-batch-${batchId}`,
  });
  await broadcastLive({ t: "ai_jobs" });
}

// ---------------------------------------------------------------------------
// "Let the AI handle all"
// ---------------------------------------------------------------------------

type OpenItem = { id: string; status: string; severity: string; title: string; detail: string | null; ops: unknown[] | null; entity_table: string | null; entity_id: string | null };

function itemPrompt(r: OpenItem): string {
  const refs = [`open item ${r.id}`, r.entity_table && r.entity_id ? `${r.entity_table} ${r.entity_id}` : null].filter(Boolean);
  const finding = (r.detail ?? "").replace(/\s+/g, " ").trim().slice(0, 700);
  return [
    `Look into this and fix it if you can: "${r.title}" (${refs.join("; ")}). Check the bill photo if the paper decides it.`,
    finding ? `The finding on it: ${finding}` : null,
    "The owner handed you his whole Needs-you list to work through and is not watching this chat: don't ask him questions and don't wait for an answer. Fix what you can prove and close the item with resolve_item. If only he can settle it, leave the item open and say in one or two sentences exactly what he has to do.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Open items the AI can take: the ones without a fix waiting for the owner's tap. */
export async function handOverCandidates(): Promise<{ eligible: OpenItem[]; tried: string[]; busy: string[] }> {
  const db = createServiceClient();
  const { data } = await db
    .from("ai_actions")
    .select("id, status, severity, title, detail, ops, entity_table, entity_id, created_at")
    .in("status", ["proposed", "info"])
    .order("created_at", { ascending: false })
    .limit(MAX_BATCH); // the same list Needs you shows
  const rank: Record<string, number> = { critical: 0, warn: 1, info: 2 };
  const rows = ((data ?? []) as OpenItem[])
    .filter((r) => !(Array.isArray(r.ops) && r.ops.length) && !String(r.entity_table ?? "").startsWith("finance"))
    .sort((a, b) => (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2));
  if (!rows.length) return { eligible: [], tried: [], busy: [] };
  const { data: jobs } = await db
    .from("ai_jobs")
    .select("action_id, status, outcome, heartbeat_at, started_at, created_at")
    .in("action_id", rows.map((r) => r.id))
    .limit(1000);
  const list = (jobs ?? []) as { action_id: string; status: string; outcome: string | null; heartbeat_at: string | null; started_at: string | null; created_at: string }[];
  const busy = new Set(list.filter((j) => j.status === "queued" || (j.status === "running" && !isStale(j))).map((j) => j.action_id));
  // Looked at before and left open: the AI said it needs the owner. Not sent again unless he asks.
  const tried = new Set(list.filter((j) => j.status === "done" && j.outcome === "needs_you").map((j) => j.action_id));
  return {
    eligible: rows.filter((r) => !busy.has(r.id) && !tried.has(r.id)),
    tried: rows.filter((r) => !busy.has(r.id) && tried.has(r.id)).map((r) => r.id),
    busy: [...busy],
  };
}

export type StartedBatch = { ok: true; batchId: string; chatId: string; count: number } | { ok: false; error: string };

/** Queues every open item without a ready fix (retry: also the ones the AI already looked at). */
export async function startBatch(opts: { retry?: boolean } = {}): Promise<StartedBatch> {
  const db = createServiceClient();
  await reapStaleJobs().catch(() => 0);
  const found = await handOverCandidates();
  const cap = (list: OpenItem[]) => list.slice(0, MAX_BATCH);
  let rows = cap(found.eligible);
  if (opts.retry && found.tried.length) {
    const { data } = await db.from("ai_actions").select("id, status, severity, title, detail, ops, entity_table, entity_id").in("id", found.tried.slice(0, MAX_BATCH)).in("status", ["proposed", "info"]);
    rows = cap([...rows, ...((data ?? []) as OpenItem[])]);
  }
  if (!rows.length) {
    return {
      ok: false,
      error: found.busy.length
        ? "The AI is already working on these."
        : found.tried.length
          ? "The AI already looked at what is left, and it needs you."
          : "Nothing to hand over: what is left has a fix waiting for your tap.",
    };
  }

  const n = rows.length;
  const { data: chat, error: chatErr } = await db
    .from("ai_chats")
    .insert({ title: `AI handles all · ${n} item${n === 1 ? "" : "s"}` })
    .select("id")
    .single();
  if (chatErr || !chat) return { ok: false, error: chatErr?.message ?? "Could not start" };
  const chatId = (chat as { id: string }).id;
  const { data: batch, error: batchErr } = await db.from("ai_batches").insert({ chat_id: chatId, total: n }).select("id").single();
  if (batchErr || !batch) {
    await db.from("ai_chats").delete().eq("id", chatId);
    return { ok: false, error: batchErr?.message ?? "Could not start" };
  }
  const batchId = (batch as { id: string }).id;
  const { error: jobsErr } = await db.from("ai_jobs").insert(
    rows.map((r, i) => ({
      kind: "item",
      mode: "chat",
      status: "queued",
      chat_id: chatId,
      batch_id: batchId,
      action_id: r.id,
      position: i,
      title: `Fix: ${r.title}`.slice(0, 200),
      prompt: itemPrompt(r),
    })),
  );
  if (jobsErr) {
    await db.from("ai_chats").delete().eq("id", chatId); // takes the batch's jobs with it
    await db.from("ai_batches").delete().eq("id", batchId);
    return { ok: false, error: jobsErr.message };
  }
  await broadcastLive({ t: "ai_jobs" });
  return { ok: true, batchId, chatId, count: n };
}

/** Stop: waiting jobs are dropped, the running one is told to stop (it notices within a few seconds). */
export async function cancelJobs(target: { chatId?: string | null; batchId?: string | null; jobId?: string | null }): Promise<{ ok: boolean; dropped: number; stopping: number }> {
  const db = createServiceClient();
  let q = db.from("ai_jobs").select("*").in("status", ["queued", "running"]);
  if (target.jobId) q = q.eq("id", target.jobId);
  else if (target.batchId) q = q.eq("batch_id", target.batchId);
  else if (target.chatId) q = q.eq("chat_id", target.chatId);
  else return { ok: false, dropped: 0, stopping: 0 };
  const { data } = await q.limit(200);
  const rows = (data ?? []) as JobRow[];
  const waiting = rows.filter((r) => r.status === "queued").map((r) => r.id);
  const running = rows.filter((r) => r.status === "running");
  for (const part of pieces(waiting)) {
    await db.from("ai_jobs").update({ status: "canceled", finished_at: new Date().toISOString(), outcome: "canceled" }).in("id", part).eq("status", "queued");
  }
  if (running.length) {
    await db
      .from("ai_jobs")
      .update({ cancel_requested: true })
      .in(
        "id",
        running.map((r) => r.id),
      )
      .eq("status", "running");
    // A run that missed several heartbeats has no server behind it to hear "stop": close it here, now.
    const gone = new Date(Date.now() - 4 * HEARTBEAT_MS).toISOString();
    for (const r of running) if (Date.parse(r.heartbeat_at ?? r.created_at) < Date.parse(gone)) await closeDeadJob(db, r, "stopped", gone);
  }
  for (const b of new Set(rows.map((r) => r.batch_id).filter((v): v is string => !!v))) await finishBatchIfDone(b).catch(() => {});
  await broadcastLive({ t: "ai_jobs" });
  return { ok: true, dropped: waiting.length, stopping: running.length };
}

// ---------------------------------------------------------------------------
// What the screens read
// ---------------------------------------------------------------------------

type OpenRow = {
  id: string;
  kind: "chat" | "item";
  mode: string;
  status: "queued" | "running";
  chat_id: string | null;
  batch_id: string | null;
  action_id: string | null;
  title: string | null;
  status_text: string | null;
  started_at: string | null;
  heartbeat_at: string | null;
  created_at: string;
};

/** Everything running or waiting (the pill on every page, and Needs you). The owner's private finance chat is left out. */
export async function jobsStatus(): Promise<JobsStatus> {
  const db = createServiceClient();
  const load = async () => {
    const { data } = await db
      .from("ai_jobs")
      .select("id, kind, mode, status, chat_id, batch_id, action_id, title, status_text, started_at, heartbeat_at, created_at")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: true })
      .order("position", { ascending: true })
      .limit(150);
    return (data ?? []) as OpenRow[];
  };
  let open = await load();
  if (open.some((j) => j.status === "running" && isStale(j))) {
    await reapStaleJobs().catch(() => 0);
    open = await load();
  }
  open = open.filter((j) => j.mode !== "finance");
  const running = open.filter((j) => j.status === "running");
  const queued = open.filter((j) => j.status === "queued");
  const batchId = [...running, ...queued].find((j) => j.batch_id)?.batch_id ?? null;

  const [recentRes, batchRes, doneRes, lastRes] = await Promise.all([
    db
      .from("ai_jobs")
      .select("id, action_id, status, outcome, summary, chat_id, finished_at")
      .not("action_id", "is", null)
      .in("status", ["done", "failed", "canceled"])
      .gt("finished_at", new Date(Date.now() - 12 * 3600_000).toISOString())
      .order("finished_at", { ascending: false })
      .limit(80),
    batchId ? db.from("ai_batches").select("id, chat_id, total").eq("id", batchId).maybeSingle() : Promise.resolve({ data: null }),
    batchId ? db.from("ai_jobs").select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("status", ["done", "failed", "canceled"]) : Promise.resolve({ count: 0 }),
    db
      .from("ai_batches")
      .select("id, chat_id, total, finished_at")
      .not("finished_at", "is", null)
      .gt("finished_at", new Date(Date.now() - 10 * 60_000).toISOString())
      .order("finished_at", { ascending: false })
      .limit(1),
  ]);

  const b = batchRes.data as { id: string; chat_id: string | null; total: number } | null;
  const lb = ((lastRes.data ?? []) as { id: string; chat_id: string | null; total: number; finished_at: string }[])[0] ?? null;
  // Newest result per item first; older runs on the same item are dropped.
  const seen = new Set<string>();
  const recent = ((recentRes.data ?? []) as { id: string; action_id: string; status: JobStatus; outcome: JobOutcome | null; summary: string | null; chat_id: string | null; finished_at: string | null }[])
    .filter((r) => (seen.has(r.action_id) ? false : (seen.add(r.action_id), true)))
    .map((r) => ({ id: r.id, actionId: r.action_id, status: r.status, outcome: r.outcome, summary: r.summary, chatId: r.chat_id, finishedAt: r.finished_at }));

  return {
    now: new Date().toISOString(),
    running: running.map((j) => ({ id: j.id, kind: j.kind, chatId: j.chat_id, batchId: j.batch_id, actionId: j.action_id, title: j.title, statusText: j.status_text, startedAt: j.started_at })),
    queued: queued.map((j) => ({ id: j.id, chatId: j.chat_id, batchId: j.batch_id, actionId: j.action_id, title: j.title })),
    batch: b ? { id: b.id, chatId: b.chat_id, total: b.total, done: doneRes.count ?? 0 } : null,
    recent,
    lastBatch: lb ? { id: lb.id, chatId: lb.chat_id, total: lb.total, finishedAt: lb.finished_at, counts: await batchCounts(db, lb.id) } : null,
  };
}

/** How many jobs are running or waiting (a cheap check for the live-updates poll). 0 when the table isn't there yet. */
export async function activeJobCount(): Promise<number> {
  const { count, error } = await createServiceClient().from("ai_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]);
  return error ? 0 : (count ?? 0);
}

type ChatJobRow = {
  id: string;
  kind: "chat" | "item";
  status: "queued" | "running";
  title: string | null;
  status_text: string | null;
  steps: Step[] | null;
  blocks: Block[] | null;
  started_at: string | null;
  heartbeat_at: string | null;
  cancel_requested: boolean;
  created_at: string;
};

/**
 * What a chat screen needs to stay current: saved messages newer than `after`,
 * the run in progress, and what is waiting. The jobs are read first and the
 * messages second, so an answer can never show twice (live and saved).
 */
export async function chatLive(chatId: string, after: string | null): Promise<ChatLive> {
  const db = createServiceClient();
  const load = async () => {
    const { data } = await db
      .from("ai_jobs")
      .select("id, kind, status, title, status_text, steps, blocks, started_at, heartbeat_at, cancel_requested, created_at")
      .eq("chat_id", chatId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: true })
      .order("position", { ascending: true })
      .limit(80);
    return (data ?? []) as ChatJobRow[];
  };
  let jobs = await load();
  if (jobs.some((j) => j.status === "running" && isStale(j))) {
    await reapStaleJobs().catch(() => 0);
    jobs = await load();
  }
  const run = jobs.filter((j) => j.status === "running").pop() ?? null;

  let q = db.from("ai_messages").select("id, role, blocks, created_at").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(200);
  if (after) q = q.gt("created_at", after);
  const { data: rows } = await q;
  const messages: SavedMessage[] = ((rows ?? []) as { id: string; role: "user" | "assistant"; blocks: Block[] | null; created_at: string }[]).map((m) => ({
    id: m.id,
    role: m.role,
    blocks: Array.isArray(m.blocks) ? m.blocks : [],
    at: m.created_at,
  }));

  // Action cards are saved with the status they had at the time; show the current one.
  const ids = [...new Set(messages.flatMap((m) => m.blocks.filter((x) => x.type === "action").map((x) => (x as { id: string }).id)).filter((id) => UUID.test(id)))];
  if (ids.length) {
    const live = await Promise.all(pieces(ids).map((part) => db.from("ai_actions").select("id, status").in("id", part)));
    const now = new Map(live.flatMap((r) => (r.data ?? []) as { id: string; status: string }[]).map((a) => [a.id, a.status]));
    for (const m of messages) m.blocks = m.blocks.map((x) => (x.type === "action" && now.has(x.id) ? { ...x, status: now.get(x.id) as string } : x));
  }

  let job: LiveJob | null = run
    ? {
        id: run.id,
        kind: run.kind,
        title: run.title,
        statusText: run.status_text,
        steps: Array.isArray(run.steps) ? run.steps : [],
        blocks: Array.isArray(run.blocks) ? run.blocks : [],
        startedAt: run.started_at,
        stopping: !!run.cancel_requested,
      }
    : null;
  // It finished between the two reads: its answer is among the messages, so it is no longer live.
  // (Compared on the database's clock: a chat job's created_at, an item job's started_at from the claim.)
  const since = run ? Date.parse(run.kind === "chat" ? run.created_at : (run.started_at ?? run.created_at)) : NaN;
  if (run && messages.some((m) => m.role === "assistant" && Date.parse(m.at) >= since)) job = null;

  return {
    now: new Date().toISOString(),
    messages,
    job,
    queued: jobs.filter((j) => j.status === "queued").map((j) => ({ id: j.id, title: j.title })),
  };
}

/** A chat for a page's first render: its saved messages, the run in progress and what is waiting. */
export async function loadChat(chatId: string): Promise<{ messages: SavedMessage[]; live: { now: string; job: LiveJob | null; queued: { id: string; title: string | null }[] } }> {
  try {
    const l = await chatLive(chatId, null);
    return { messages: l.messages, live: { now: l.now, job: l.job, queued: l.queued } };
  } catch {
    const { data } = await createServiceClient().from("ai_messages").select("id, role, blocks, created_at").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(200);
    const messages = ((data ?? []) as { id: string; role: "user" | "assistant"; blocks: Block[] | null; created_at: string }[]).map((m) => ({
      id: m.id,
      role: m.role,
      blocks: Array.isArray(m.blocks) ? m.blocks : [],
      at: m.created_at,
    }));
    return { messages, live: { now: new Date().toISOString(), job: null, queued: [] } };
  }
}
