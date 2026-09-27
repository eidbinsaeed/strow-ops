/**
 * The Strow AI loop: model ⇄ tools until the answer is done, the step budget
 * is spent, or the deadline hits. Streams progress through ctx.emit.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlock, MessageParam, ToolResultBlockParam, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { DISPLAY_TOOLS, executeTool, statusFor, toolsFor, type ToolContext } from "./tools";
import type { TextBlock } from "./types";

export const PRIMARY_MODEL = process.env.STROW_AI_MODEL || "claude-opus-5-5";
export const FALLBACK_MODEL = process.env.STROW_AI_FALLBACK_MODEL || "claude-sonnet-4-6";

function isModelUnavailable(e: unknown): boolean {
  const err = e as { status?: number; message?: string };
  return err?.status === 404 || (err?.status === 400 && /model/i.test(err?.message ?? ""));
}

function firstSentence(t: string): string {
  const s = t.replace(/\s+/g, " ").trim();
  const m = /^(.{8,140}?[.!?:])(\s|$)/.exec(s);
  return (m ? m[1] : s.slice(0, 140)).replace(/[:.]$/, "");
}

function emitText(ctx: ToolContext, text: string) {
  const block: TextBlock = { type: "text", text };
  ctx.blocks.push(block);
  ctx.emit({ t: "block", block });
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
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 150_000 });
  const tools = toolsFor(opts.ctx.mode);
  const messages: MessageParam[] = [...opts.messages];
  let model = PRIMARY_MODEL;
  let finalText = "";
  let steps = 0;
  let unfinished = false;

  while (true) {
    if (steps >= opts.maxSteps || Date.now() > opts.deadline) {
      unfinished = true;
      break;
    }
    steps++;
    let resp;
    try {
      resp = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        system: opts.system,
        tools,
        messages,
      });
    } catch (e) {
      if (model !== FALLBACK_MODEL && isModelUnavailable(e)) {
        model = FALLBACK_MODEL;
        steps--;
        continue;
      }
      throw e;
    }

    const content = resp.content as ContentBlock[];
    const toolUses = content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    const text = content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
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

  if (unfinished && opts.ctx.mode === "chat") {
    const note = finalText
      ? "I stopped here to keep things quick — say “continue” and I'll carry on."
      : "That took more digging than one pass allows. Say “continue” and I'll pick up where I stopped.";
    emitText(opts.ctx, note);
    finalText += (finalText ? "\n\n" : "") + note;
  }
  return { text: finalText, model, steps };
}
