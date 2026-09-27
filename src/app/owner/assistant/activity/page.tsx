import Link from "next/link";
import type { Route } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { ActionButtons, StatusChip } from "@/components/ai/ActionButtons";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "needs", label: "Needs you", statuses: ["proposed"] },
  { key: "alerts", label: "Alerts", statuses: ["info"] },
  { key: "fixed", label: "Fixed", statuses: ["applied"] },
  { key: "history", label: "History", statuses: ["undone", "rejected", "failed"] },
] as const;

type Row = {
  id: string;
  created_at: string;
  source: string;
  status: string;
  severity: string;
  title: string;
  detail: string | null;
  confidence: number | null;
  ops: unknown[] | null;
  error: string | null;
  entity_table: string | null;
  entity_id: string | null;
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function AiActivityPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const db = createServiceClient();
  const [listRes, ...counts] = await Promise.all([
    db.from("ai_actions").select("*").in("status", [...tab.statuses]).order("created_at", { ascending: false }).limit(100),
    ...TABS.map((t) => db.from("ai_actions").select("*", { count: "exact", head: true }).in("status", [...t.statuses])),
  ]);
  const rows = (listRes.data ?? []) as Row[];

  return (
    <div className="page">
      <header className="mb-5 flex items-center gap-3">
        <span className="ai-orb h-9 w-9 shrink-0" aria-hidden />
        <div>
          <h1 className="text-2xl font-light tracking-tight">AI activity</h1>
          <p className="text-sm text-neutral-500">Everything Strow AI fixed, proposed or flagged — all undoable.</p>
        </div>
      </header>

      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t, i) => {
          const on = t.key === tab.key;
          return (
            <Link
              key={t.key}
              href={`/owner/assistant/activity?tab=${t.key}` as Route}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition ${on ? "bg-strow-ink text-white" : "border border-neutral-300 bg-white text-neutral-700"}`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? "bg-white/20" : "bg-neutral-100 text-neutral-500"}`}>{counts[i]?.count ?? 0}</span>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">Nothing here.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <StatusChip status={a.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-strow-ink">{a.title}</p>
                  {a.detail ? <p className="mt-1 text-sm leading-relaxed text-neutral-600">{a.detail}</p> : null}
                  {a.error ? <p className="mt-1 text-xs text-red-600">{a.error}</p> : null}
                  <p className="mt-1.5 text-[11px] text-neutral-400">
                    {when(a.created_at)} · {a.source === "autopilot" ? "Autopilot" : a.source === "chat" ? "Chat" : "Owner"}
                    {a.confidence != null && a.status !== "info" ? ` · ${Math.round(Number(a.confidence) * 100)}% sure` : ""}
                    {Array.isArray(a.ops) && a.ops.length ? ` · ${a.ops.length} change${a.ops.length === 1 ? "" : "s"}` : ""}
                  </p>
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
      )}
    </div>
  );
}
