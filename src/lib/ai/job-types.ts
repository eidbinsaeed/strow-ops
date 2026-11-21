/**
 * Shapes of Strow AI's background jobs as the screens see them.
 * Shared by the server routes and the client; no imports beyond types.
 */
import type { Block, Step } from "./types";

export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";
/** What became of a Needs-you item the AI worked on. */
export type JobOutcome = "fixed" | "closed" | "needs_you" | "failed" | "canceled";

/** A run in progress: its steps and what it has written so far. */
export type LiveJob = {
  id: string;
  kind: "chat" | "item";
  title: string | null;
  statusText: string | null;
  steps: Step[];
  blocks: Block[];
  startedAt: string | null;
  /** Stop was tapped; the run is winding down. */
  stopping: boolean;
};

export type SavedMessage = { id: string; role: "user" | "assistant"; blocks: Block[]; at: string };

/** GET /api/ai/jobs/chat — what a chat screen needs to stay current. */
export type ChatLive = {
  now: string;
  /** Saved messages newer than the `after` the screen sent (all of them when it sent none). */
  messages: SavedMessage[];
  job: LiveJob | null;
  /** Items handed over together that have not started yet. */
  queued: { id: string; title: string | null }[];
};

export type BatchCounts = { fixed: number; closed: number; needsYou: number; failed: number; canceled: number; changes: number };

export type RunningJob = {
  id: string;
  kind: "chat" | "item";
  chatId: string | null;
  batchId: string | null;
  actionId: string | null;
  title: string | null;
  statusText: string | null;
  startedAt: string | null;
};

/** GET /api/ai/jobs — everything running or waiting, for the pill on every page and for Needs you. */
export type JobsStatus = {
  now: string;
  running: RunningJob[];
  queued: { id: string; chatId: string | null; batchId: string | null; actionId: string | null; title: string | null }[];
  /** The hand-over in progress, if any. */
  batch: { id: string; chatId: string | null; total: number; done: number } | null;
  /** Needs-you items the AI finished with in the last hours (by the item's id). */
  recent: { id: string; actionId: string; status: JobStatus; outcome: JobOutcome | null; summary: string | null; chatId: string | null; finishedAt: string | null }[];
  /** A hand-over that finished in the last few minutes. */
  lastBatch: { id: string; chatId: string | null; total: number; finishedAt: string; counts: BatchCounts } | null;
};

export function emptyCounts(): BatchCounts {
  return { fixed: 0, closed: 0, needsYou: 0, failed: 0, canceled: 0, changes: 0 };
}

/** "4 fixed · 1 closed · 2 need you" — zeros left out. */
export function countsLine(c: BatchCounts, ar = false): string {
  const parts: string[] = [];
  // Arabic puts the word first ("تم إصلاح 4"): it reads naturally for any number.
  if (c.fixed) parts.push(ar ? `تم إصلاح ${c.fixed}` : `${c.fixed} fixed`);
  if (c.closed) parts.push(ar ? `أُغلق ${c.closed}` : `${c.closed} closed`);
  if (c.needsYou) parts.push(ar ? `يحتاجك ${c.needsYou}` : `${c.needsYou} need${c.needsYou === 1 ? "s" : ""} you`);
  if (c.failed) parts.push(ar ? `لم يكتمل ${c.failed}` : `${c.failed} didn't finish`);
  if (c.canceled) parts.push(ar ? `أُوقف ${c.canceled}` : `${c.canceled} stopped`);
  return parts.join(" · ") || (ar ? "لا شيء" : "nothing to do");
}
