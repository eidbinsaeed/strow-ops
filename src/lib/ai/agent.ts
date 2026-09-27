/**
 * The Strow AI loop: model ⇄ tools until the answer is done, the step budget
 * is spent, or the deadline hits. Streams progress through ctx.emit.
 *
 * Guarantees: a reply cut off by the length limit is never silently dropped
 * (the model is told to redo it in smaller batches), and a chat turn never
 * ends without a written answer.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { DISPLAY_TOOLS, executeTool, statusFor, toolsFor, type ToolContext } from "./tools";
import type { TextBlock } from "./types";

export const PRIMARY_MODEL = process.env.STROW_AI_MODEL || "claude-opus-5-5";
export const FALLBACK_MODEL = process.env.STROW_AI_FALLBACK_MODEL || "claude-sonnet-4-6";

const CUT_OFF_NUDGE =
  "Your last reply was cut off because it was too long, so none of it was applied. Redo it in smaller pieces: at most 10 row changes per change_data call and short reasons, then carry on with the rest.";
const SUMMARY_NUDGE =
  "Now answer the owner in plain text, 2–6 short sentences: what you found, exactly what you changed (or that nothing needed changing), and what is still left for him. Do not call any tools.";

function isModelUnavailable(e: unknown): boolean {
  const err = e as { status?: number; message?: string };
  return err?.status === 404 || (err?.status === 400 && /model/i.test(err?.message ?? ""));
}

function firstSentence(t: string): string {
  const s = t.replace(/\s+/g, " ").trim();
  const m = /^(.{8,140}?[.!?:])(\s|$)/.exec(s);
  return (m ? m[1] : s.slice(0, 140)).replace(/[:.]$/, "");
}

function textOf(content: ContentBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();
}

function emitText(ctx: ToolContext, text: string) {
  const block: TextBlock = { type: "text", text };
  ctx.blocks.push(block);
  ctx.emit({ t: "block", block });
}

/** Adds an instruction to the last user turn (keeps the user/assistant alternation valid). */
function nudge(messages: MessageParam[], text: string) {
  const last = messages[messages.length - 1];
  const extra: TextBlockParam = { type: "text", text };
  if (!last || last.role !== "user") {
    messages.push({ role: "user", content: [extra] });
    return;
  }
  const blocks = typeof last.content === "string" ? [{ type: "text", text: last.content } as TextBlockParam] : [...last.content];
  messages[messages.length - 1] = { role: "user", content: [...blocks, extra] as MessageParam["content"] };
}

export async function runAgent(opts: {
  system: string;
  messages: MessageParam[];
  ctx: ToolContext;
  maxSteps: number;
  deadline: number;
  maxTokens?: number;
}): Promise<{ text: string; model: string; steps: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 170_000 });
  const tools = toolsFor(opts.ctx.mode);
  const messages: MessageParam[] = [...opts.messages];
  let model = PRIMARY_MODEL;
  let finalText = "";
  let steps = 0;
  let cutOffs = 0;
  let unfinished = false;

  const call = async (maxTokens: number, extra: Record<string, unknown> = {}, timeout?: number): Promise<Message> => {
    for (;;) {
      try {
        const params = { model, max_tokens: maxTokens, system: opts.system, tools, messages, ...extra } as unknown as MessageCreateParamsNonStreaming;
        return await client.messages.create(params, timeout ? { timeout } : undefined);
      } catch (e) {
        if (model !== FALLBACK_MODEL && isModelUnavailable(e)) {
          model = FALLBACK_MODEL;
          continue;
        }
        throw e;
      }
    }
  };

  while (true) {
    if (steps >= opts.maxSteps || Date.now() > opts.deadline) {
      unfinished = true;
      break;
    }
    steps++;
    const resp = await call(opts.maxTokens ?? 16000);
    const content = resp.content as ContentBlock[];
    const toolUses = content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    const text = textOf(content);

    if (resp.stop_reason === "max_tokens") {
      console.warn(`[strow-ai] reply cut off at the length limit (step ${steps}, ${toolUses.length} tool call(s))`);
      if (toolUses.length === 0 && text) {
        emitText(opts.ctx, text + " …");
        finalText += (finalText ? "\n\n" : "") + text;
        break;
      }
      if (++cutOffs > 2) break;
      opts.ctx.emit({ t: "status", text: "Splitting the work into smaller steps" });
      nudge(messages, CUT_OFF_NUDGE);
      continue;
    }

    const onlyDisplay = toolUses.every((t) => DISPLAY_TOOLS.has(t.name));
    if (text) {
      if (toolUses.length === 0 || onlyDisplay) {
        emitText(opts.ctx, text);
        finalText += (finalText ? "\n\n" : "") + text;
      } else {
        opts.ctx.emit({ t: "status", text: firstSentence(text) });
      }
    }

    if (resp.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: content as unknown as MessageParam["content"] });
    const results: ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      opts.ctx.emit({ t: "status", text: statusFor(tu.name, tu.input) });
      const out = await executeTool(tu.name, tu.input, opts.ctx);
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: out.content,
        ...(out.isError ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: results });
    if (onlyDisplay && toolUses.some((t) => t.name === "suggest_followups")) break;
  }

  // Never end a chat turn silently: ask for a short written answer (no tools).
  if (opts.ctx.mode === "chat" && !finalText && Date.now() < opts.deadline + 15_000) {
    try {
      opts.ctx.emit({ t: "status", text: "Writing it up" });
      nudge(messages, SUMMARY_NUDGE);
      const resp = await call(1500, { tool_choice: { type: "none" } }, 30_000);
      const t = textOf(resp.content as ContentBlock[]);
      if (t) {
        emitText(opts.ctx, t);
        finalText = t;
      }
    } catch (e) {
      console.warn("[strow-ai] summary call failed:", e instanceof Error ? e.message : e);
    }
  }

  if (unfinished && opts.ctx.mode === "chat") {
    const note = "I stopped here to keep things quick — say “continue” and I'll carry on.";
    emitText(opts.ctx, note);
    finalText += (finalText ? "\n\n" : "") + note;
  }
  return { text: finalText, model, steps };
}
