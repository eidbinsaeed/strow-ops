import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { ActionButtons } from "./ActionButtons";
import { RunAutopilotButton } from "./RunAutopilotButton";
import { CountUpText } from "./CountUp";

type Row = {
  id: string;
  status: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string | null;
  ops: unknown[] | null;
  entity_table: string | null;
  entity_id: string | null;
};

const RANK: Record<string, number> = { critical: 0, warn: 1, info: 2 };

function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function Dot({ sev }: { sev: string }) {
  const c = sev === "critical" ? "bg-red-500" : sev === "warn" ? "bg-amber-400" : "bg-sky-400";
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c}`} />;
}

/** Dashboard card: what the AI fixed, what needs the owner, and alerts. */
export async function AutopilotCard() {
  const db = createServiceClient();
  const [runRes, openRes, fixedCountRes] = await Promise.all([
    db.from("ai_runs").select("id, status, started_at, finished_at, summary").neq("trigger", "expense").order("started_at", { ascending: false }).limit(1),
    db.from("ai_actions").select("id, status, severity, title, detail, ops, entity_table, entity_id").in("status", ["proposed", "info"]).order("created_at", { ascending: false }).limit(40),
    db.from("ai_actions").select("*", { count: "exact", head: true }).eq("status", "applied"),
  ]);
  if (runRes.error || openRes.error) return null;

  const run = (runRes.data?.[0] ?? null) as { status: string; started_at: string; finished_at: string | null; summary: string | null } | null;
  const open = ((openRes.data ?? []) as Row[]).sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3));
  const needs = open.filter((a) => a.status === "proposed");
  const alerts = open.filter((a) => a.status === "info");
  const fixed = fixedCountRes.count ?? 0;
  const top = open.slice(0, 4);

  const counters: { label: string; value: number; href: Route; cls: string }[] = [
    { label: "Fixed", value: fixed, href: "/owner/assistant/activity?tab=fixed" as Route, cls: "text-emerald-600" },
    { label: "Needs you", value: needs.length, href: "/owner/assistant/activity?tab=needs" as Route, cls: "text-amber-600" },
    { label: "Alerts", value: alerts.length, href: "/owner/assistant/activity?tab=alerts" as Route, cls: "text-red-600" },
  ];

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center gap-3 px-5 pt-5">
        <span className="ai-orb h-10 w-10 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-strow-ink">Strow AI · Autopilot</p>
          <p className="truncate text-xs text-neutral-500">
            {run ? (run.status === "running" ? "Checking your books now…" : `Last check ${ago(run.finished_at ?? run.started_at)}`) : "No checks yet"}
          </p>
        </div>
        <Link href="/owner/assistant" className="shrink-0 rounded-full bg-strow-ink px-4 py-2 text-sm text-white transition active:scale-[.97]">
          Ask AI
        </Link>
      </div>
      {run?.summary ? <p className="px-5 pt-3 text-sm leading-relaxed text-neutral-600">{run.summary}</p> : null}

      <div className="mt-4 grid grid-cols-3 divide-x divide-neutral-100 border-y border-neutral-100 rtl:divide-x-reverse">
        {counters.map((c) => (
          <Link key={c.label} href={c.href} className="px-2 py-3 text-center transition hover:bg-neutral-50 active:bg-neutral-100">
            <p className={`text-2xl font-light ${c.cls}`}>
              <CountUpText text={String(c.value)} />
            </p>
            <p className="text-[11px] uppercase tracking-wider text-neutral-500">{c.label}</p>
          </Link>
        ))}
      </div>

      {top.length ? (
        <ul className="divide-y divide-neutral-100">
          {top.map((a) => (
            <li key={a.id} className="px-5 py-4">
              <div className="flex items-start gap-2.5">
                <Dot sev={a.severity} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-strow-ink">{a.title}</p>
                  {a.detail ? <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-neutral-500">{a.detail}</p> : null}
                  <div className="mt-3">
                    <ActionButtons
                      id={a.id}
                      status={a.status}
                      hasOps={Array.isArray(a.ops) && a.ops.length > 0}
                      title={a.title}
                      entityTable={a.entity_table}
                      entityId={a.entity_id}
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-5 text-sm text-emerald-700">All clear — nothing needs you right now.</p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-neutral-100 px-5 py-4">
        <RunAutopilotButton />
        <Link href="/owner/assistant/activity" className="pt-2 text-sm text-neutral-500 underline-offset-4 hover:underline">
          All AI activity →
        </Link>
      </div>
    </section>
  );
}
