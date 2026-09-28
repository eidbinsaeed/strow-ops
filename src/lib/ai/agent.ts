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
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { DISPLAY_TOOLS, executeTool, statusFor, toolsFor, type ToolContext, type ToolOutcome } from "./tools";
import { addUsage, emptyUsage, logUsage } from "./usage";
import type { TextBlock } from "./types";

/** Which model does which job. Sonnet by default; Opus only in Deep mode; Haiku for quick per-bill checks. */
export const MODELS = {
  deep: process.env.STROW_AI_DEEP_MODEL || "claude-opus-5-5",
  standard: process.env.STROW_AI_MODEL || "claude-sonnet-5",
  light: process.env.STROW_AI_LIGHT_MODEL || "claude-haiku-4-5-20251001",
};
export const PRIMARY_MODEL = MODELS.standard;
export const FALLBACK_MODEL = process.env.STROW_AI_FALLBACK_MODEL || "claude-sonnet-4-6";

/** Prompt caching: the last message gets a cache breakpoint, so every following step re-reads the conversation at 10% of the price. */
function withCacheBreakpoint(messages: MessageParam[]): MessageParam[] {
  if (!messages.length) return messages;
  const out = messages.slice();
  const last = out[out.length - 1];
  const blocks = (typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content]) as Array<Record<string, unknown>>;
  if (!blocks.length) return out;
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
  out[out.length - 1] = { ...last, content: blocks as unknown as MessageParam["content"] };
  return out;
}

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
  tools?: Tool[];
  execute?: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolOutcome>;
  model?: string;
  usageSource?: string;
}): Promise<{ text: string; model: string; steps: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 170_000 });
  const tools = opts.tools ?? toolsFor(opts.ctx.mode);
  const exec = opts.execute ?? executeTool;
  const messages: MessageParam[] = [...opts.messages];
  let model = opts.model ?? MODELS.standard;
  const usage = emptyUsage();
  // Cached once per turn: the tools + system prompt are the same on every step.
  const cachedTools = tools.length ? [...tools.slice(0, -1), { ...tools[tools.length - 1], cache_control: { type: "ephemeral" } }] : tools;
  const cachedSystem = [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }];
  let finalText = "";
  let steps = 0;
  let cutOffs = 0;
  let unfinished = false;

  const call = async (maxTokens: number, extra: Record<string, unknown> = {}, timeout?: number): Promise<Message> => {
    for (;;) {
      try {
        const params = { model, max_tokens: maxTokens, system: cachedSystem, tools: cachedTools, messages: withCacheBreakpoint(messages), ...extra } as unknown as MessageCreateParamsNonStreaming;
        const res = await client.messages.create(params, timeout ? { timeout } : undefined);
        addUsage(usage, (res as unknown as { usage?: unknown }).usage);
        return res;
      } catch (e) {
        if (model !== FALLBACK_MODEL && isModelUnavailable(e)) {
          model = FALLBACK_MODEL;
          continue;
        }
        throw e;
      }
    }
  };

  try {
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
        const out = await exec(tu.name, tu.input, opts.ctx);
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
  } finally {
    await logUsage(opts.usageSource ?? opts.ctx.mode, model, usage, { chatId: opts.ctx.chatId, runId: opts.ctx.runId });
  }
  return { text: finalText, model, steps };
}
