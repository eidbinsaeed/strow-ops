/**
 * "Redo with my note": the owner steers a fix before anything changes.
 * The AI re-reads the finding, the data and the bill photo with his note as
 * the truth, and saves a new proposal (never applied by itself). The old item
 * closes with his note on it; the new one carries the note at the top.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { broadcastLive } from "@/lib/live";
import { buildSystemPrompt } from "./prompt";
import { MODELS, runAgent } from "./agent";
import { executeTool, toolsFor, type ToolContext } from "./tools";
import { closeOpenItem } from "./ops";
import { NOTE_PREFIX, paperFor, splitNote, type ActionLite } from "./action-context";
import type { StreamEvent } from "./types";

export type ReviseResult = {
  ok: boolean;
  /** replaced = a new finding took its place; resolved = the AI agreed nothing needs changing. */
  status: "replaced" | "resolved" | "unchanged";
  newId?: string;
  message: string;
};

/** What /api/ai/actions/revise streams, one JSON per line: the AI's steps as it works, then the result. */
export type ReviseEvent = StreamEvent | ({ t: "result" } & ReviseResult);

const PAPER_TABLES = new Set(["expenses", "closings", "expense_line_items"]);

export function cleanNote(note: unknown): string {
  return String(note ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

export async function reviseAction(id: string, rawNote: string, emit: (e: StreamEvent) => void): Promise<ReviseResult> {
  const db = createServiceClient();
  const { data } = await db.from("ai_actions").select("id, status, title, detail, ops, entity_table, entity_id, error").eq("id", id).maybeSingle();
  const a = data as (ActionLite & { status: string; error: string | null }) | null;
  if (!a) return { ok: false, status: "unchanged", message: "That item is gone." };
  if (!["proposed", "info"].includes(a.status)) return { ok: false, status: "unchanged", message: "That item is already closed." };

  const note = cleanNote(rawNote);
  const paper = (await paperFor([a])).get(a.id) ?? null;
  const prev = splitNote(a.detail);
  const task = [
    `Open item ${a.id} on the owner's Needs you list.`,
    `Title: ${a.title}`,
    prev.detail ? `Your earlier finding: ${prev.detail}` : null,
    prev.note ? `His earlier note on it: ${prev.note}` : null,
    a.ops?.length ? `The fix you proposed (not applied): ${JSON.stringify(a.ops).slice(0, 4000)}` : "No fix was proposed yet (it was an alert).",
    a.error ? `When he tapped Apply it failed: ${a.error}` : null,
    paper
      ? `It is about ${paper.table} ${paper.id} — view_bill_photo with table "${paper.table}" shows the paper.`
      : a.entity_table && a.entity_id
        ? `It is about ${a.entity_table} ${a.entity_id}.`
        : null,
    "",
    note ? `His note: "${note}"` : "He wrote no note: rebuild the fix so it works, checking it again against the data and the photo.",
    "",
    `Redo the fix following ${note ? "his note" : "the data"} and save it with propose_change, or call resolve_item on ${a.id} if nothing should change.`,
  ]
    .filter((x) => x !== null)
    .join("\n");

  const ctx: ToolContext = { mode: "autopilot", emit, blocks: [], photosLeft: 2, actions: [] };
  emit({ t: "status", text: note ? "Reading your note" : "Checking it again" });
  const res = await runAgent({
    system: await buildSystemPrompt("review"),
    messages: [{ role: "user", content: task }],
    ctx,
    tools: toolsFor("autopilot").filter((t) => t.name !== "change_data"),
    // The fix waits for his tap: nothing is applied from here.
    execute: (name, input, c) =>
      name === "change_data" ? Promise.resolve({ content: "Not available here — use propose_change.", isError: true }) : executeTool(name, input, c),
    maxSteps: 8,
    deadline: Date.now() + 120_000,
    model: MODELS.standard,
    usageSource: "review",
  });

  const created = ctx.actions.filter((x) => x.id && x.id !== a.id && (x.status === "proposed" || x.status === "info"));
  if (created.length) {
    for (const c of created) {
      const { data: row } = await db.from("ai_actions").select("detail, entity_table, entity_id").eq("id", c.id).maybeSingle();
      const r = row as { detail: string | null; entity_table: string | null; entity_id: string | null } | null;
      const patch: Record<string, unknown> = {};
      if (note) patch.detail = `${NOTE_PREFIX}${note}\n${r?.detail ?? ""}`.trim();
      // Keep the bill he was looking at next to the new fix.
      if (paper && !(r?.entity_id && PAPER_TABLES.has(r.entity_table ?? ""))) {
        patch.entity_table = paper.table;
        patch.entity_id = paper.id;
      }
      if (Object.keys(patch).length) await db.from("ai_actions").update(patch).eq("id", c.id);
    }
    await closeOpenItem(a.id, note ? `redone with your note: "${note.slice(0, 200)}"` : "redone");
    await broadcastLive({ t: "ai_runs" });
    return { ok: true, status: "replaced", newId: created[0].id, message: res.text || "New fix ready." };
  }
  if ((ctx.resolved ?? []).includes(a.id)) {
    await broadcastLive({ t: "ai_runs" });
    return { ok: true, status: "resolved", message: res.text || "Closed — nothing needed changing." };
  }
  return {
    ok: false,
    status: "unchanged",
    message: res.text ? `No new fix: ${res.text.slice(0, 300)}` : "The AI couldn't rebuild the fix this time. Try a clearer note.",
  };
}
