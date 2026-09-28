/**
 * AI spend tracking. Every model request records its tokens and an estimated
 * USD cost in ai_usage, so the owner can see what the AI costs and Autopilot
 * can pause at a monthly budget.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { todayDubai } from "@/lib/dates";

// USD per million tokens (Claude API, September 2026). Cache reads cost 10% of input, 5-minute cache writes 125%.
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
};

export type Usage = { calls: number; input: number; output: number; cacheWrite: number; cacheRead: number };
export const emptyUsage = (): Usage => ({ calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });

export function addUsage(u: Usage, raw: unknown) {
  const r = (raw ?? {}) as Record<string, number | null | undefined>;
  u.calls += 1;
  u.input += r.input_tokens ?? 0;
  u.output += r.output_tokens ?? 0;
  u.cacheWrite += r.cache_creation_input_tokens ?? 0;
  u.cacheRead += r.cache_read_input_tokens ?? 0;
}

export function costOf(model: string, u: Usage): number {
  const p = PRICES[model] ?? PRICES["claude-sonnet-5"];
  return (u.input * p.in + u.cacheWrite * p.in * 1.25 + u.cacheRead * p.in * 0.1 + u.output * p.out) / 1_000_000;
}

export async function logUsage(source: string, model: string, u: Usage, ids: { chatId?: string | null; runId?: string | null } = {}) {
  if (!u.calls) return;
  try {
    await createServiceClient().from("ai_usage").insert({
      source,
      model,
      calls: u.calls,
      input_tokens: u.input,
      output_tokens: u.output,
      cache_write_tokens: u.cacheWrite,
      cache_read_tokens: u.cacheRead,
      cost_usd: Math.round(costOf(model, u) * 10000) / 10000,
      chat_id: ids.chatId ?? null,
      run_id: ids.runId ?? null,
    });
  } catch {
    /* spend tracking never blocks the AI */
  }
}

/** Log one plain request (e.g. a photo read) straight from the API response's usage object. */
export async function logResponseUsage(source: string, model: string, rawUsage: unknown) {
  const u = emptyUsage();
  addUsage(u, rawUsage);
  await logUsage(source, model, u);
}

export function monthStartIso(): string {
  return new Date(`${todayDubai().slice(0, 7)}-01T00:00:00+04:00`).toISOString();
}
export function dayStartIso(): string {
  return new Date(`${todayDubai()}T00:00:00+04:00`).toISOString();
}

export async function spendSince(iso: string): Promise<{ total: number; calls: number; bySource: Record<string, number> }> {
  const { data } = await createServiceClient().from("ai_usage").select("source, cost_usd, calls").gte("created_at", iso).range(0, 19999);
  const rows = (data ?? []) as { source: string; cost_usd: number | string; calls: number }[];
  const bySource: Record<string, number> = {};
  let total = 0, calls = 0;
  for (const r of rows) {
    const c = Number(r.cost_usd || 0);
    total += c;
    calls += r.calls || 0;
    bySource[r.source] = (bySource[r.source] ?? 0) + c;
  }
  return { total, calls, bySource };
}
