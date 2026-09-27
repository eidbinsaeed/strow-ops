/**
 * Autopilot: unattended checks of the books.
 *  - "cron"/"manual": full sweep (nightly at 02:00 Dubai, or the Run button)
 *  - "expense": one new bill, right after a barista submits it
 */
import { createServiceClient } from "@/lib/supabase/server";
import { buildSystemPrompt } from "./prompt";
import { runAgent, PRIMARY_MODEL } from "./agent";
import type { ToolContext } from "./tools";

export type AutopilotTrigger = "cron" | "manual" | "expense";

export type AutopilotResult = {
  runId: string;
  summary: string;
  applied: number;
  proposed: number;
  flagged: number;
  skipped?: boolean;
};

export async function runAutopilot(
  trigger: AutopilotTrigger,
  opts: { expenseId?: string; budgetMs?: number } = {},
): Promise<AutopilotResult> {
  const db = createServiceClient();

  if (trigger !== "expense") {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: running } = await db
      .from("ai_runs")
      .select("id")
      .eq("status", "running")
      .in("trigger", ["cron", "manual"])
      .gt("started_at", tenMinAgo)
      .limit(1);
    if (running && running.length) {
      return { runId: (running[0] as { id: string }).id, summary: "A check is already running — give it a minute.", applied: 0, proposed: 0, flagged: 0, skipped: true };
    }
  }

  const { data: lastDone } = await db
    .from("ai_runs")
    .select("started_at")
    .eq("status", "done")
    .in("trigger", ["cron", "manual"])
    .order("started_at", { ascending: false })
    .limit(1);
  const since = (lastDone?.[0] as { started_at?: string } | undefined)?.started_at ?? new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { data: run, error: runErr } = await db
    .from("ai_runs")
    .insert({ trigger, status: "running", model: PRIMARY_MODEL })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(runErr?.message ?? "Could not start run");
  const runId = (run as { id: string }).id;

  const single = trigger === "expense";
  const ctx: ToolContext = { mode: "autopilot", runId, emit: () => {}, blocks: [], photosLeft: single ? 2 : 8, actions: [] };

  const task = single
    ? `A barista just submitted purchase bill ${opts.expenseId}. Check it now: read the bill row and its line items, compare with this supplier's history and normal prices (see your memory), and look at the photo if anything looks off — quantities that are really pack sizes, unit prices far from normal, dates far from today, VAT maths, lines not adding up to the total, a duplicate invoice number, an unknown or duplicate supplier, lines not linked to an inventory item. Fix what you can prove, propose or flag the rest. Be quick: this is one bill.`
    : `Run a full check of the books. Focus on records created or changed since ${since}, then look for older problems that are still open. Check at least:
1. Purchases: subtotal + VAT = total; line items add up to the bill; unit prices normal for that item and supplier; quantities that look like pack sizes; dates far from created_at; duplicate bills (same supplier and invoice number, or same photo); vendors that are really the same shop; lines not linked to an inventory item that match an existing item or alias (link them and add the alias).
2. Sales closings: duplicates, impossible dates, and cash/card/online splits that look wrong.
3. Cash position and missing closings — only flag them if they are not already open.
Work in batches with SQL that finds problems across many rows at once. Look at up to 8 photos where the paper decides the answer.`;

  try {
    const system = await buildSystemPrompt("autopilot");
    const result = await runAgent({
      system,
      messages: [{ role: "user", content: task }],
      ctx,
      maxSteps: single ? 10 : 28,
      deadline: Date.now() + (opts.budgetMs ?? (single ? 110_000 : 250_000)),
    });
    const applied = ctx.actions.filter((a) => a.status === "applied").length;
    const proposed = ctx.actions.filter((a) => a.status === "proposed").length;
    const flagged = ctx.actions.filter((a) => a.status === "info").length;
    const fallback = `Checked ${single ? "the new bill" : "the books"}: ${applied} fixed, ${proposed} waiting for you, ${flagged} alert${flagged === 1 ? "" : "s"}.`;
    const summary = (result.text || fallback).slice(0, 1200);
    await db
      .from("ai_runs")
      .update({ status: "done", finished_at: new Date().toISOString(), summary, model: result.model, stats: { applied, proposed, flagged, steps: result.steps } })
      .eq("id", runId);
    return { runId, summary, applied, proposed, flagged };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("ai_runs").update({ status: "failed", finished_at: new Date().toISOString(), summary: message.slice(0, 500) }).eq("id", runId);
    throw e;
  }
}
