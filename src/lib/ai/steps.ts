/**
 * The AI's step list: every "status" event starts a step, a "note" event
 * finishes it with a short result ("38 rows", "done · 2 changes").
 * Shared by the chat route (to save it with the answer) and the chat screen
 * (to show it live). Pure, no imports beyond types.
 */
import type { Step, StepsBlock, StreamEvent } from "./types";

const GENERIC = new Set(["Thinking", "أفكر", "Wrapping up", "Drawing it"]);

/** Returns a new list with the event applied (status → new step, note → result of the last step). */
export function applyStepEvent(steps: Step[], e: StreamEvent): Step[] {
  if (e.t === "status") {
    const text = e.text.trim();
    if (!text) return steps;
    const last = steps[steps.length - 1];
    if (last && last.text === text && !last.note) return steps;
    return [...steps, { text }];
  }
  if (e.t === "note" && steps.length) {
    const out = steps.slice();
    const last = out[out.length - 1];
    out[out.length - 1] = { ...last, note: e.text, ...(e.ok === false ? { ok: false } : {}) };
    return out;
  }
  return steps;
}

/** The steps worth showing ("Thinking" on its own says nothing). */
export function visibleSteps(steps: Step[]): Step[] {
  return steps.filter((s) => !GENERIC.has(s.text)).slice(0, 40);
}

/** The block saved above the answer, or null when there was nothing worth listing. */
export function stepsBlock(steps: Step[], seconds: number): StepsBlock | null {
  const items = visibleSteps(steps);
  if (!items.length) return null;
  return { type: "steps", items, seconds: Math.max(0, Math.round(seconds)) };
}
