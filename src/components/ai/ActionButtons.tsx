"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionBlock } from "@/lib/ai/types";
import { PhotoViewer, photoSrc } from "./PhotoViewer";

const STATUS: Record<string, { label: string; cls: string }> = {
  applied: { label: "Fixed", cls: "bg-emerald-50 text-emerald-700" },
  proposed: { label: "Needs you", cls: "bg-amber-50 text-amber-800" },
  info: { label: "Alert", cls: "bg-red-50 text-red-700" },
  undone: { label: "Undone", cls: "bg-neutral-100 text-neutral-500" },
  rejected: { label: "Dismissed", cls: "bg-neutral-100 text-neutral-500" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
  resolved: { label: "Resolved", cls: "bg-emerald-50 text-emerald-700" },
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-600" };
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${s.cls}`}>{label ?? s.label}</span>;
}

export function askAiHref(title: string, entityTable?: string | null, entityId?: string | null, actionId?: string | null): Route {
  const refs = [actionId ? `open item ${actionId}` : null, entityTable && entityId ? `${entityTable} ${entityId}` : null].filter(Boolean);
  const prompt = `Look into this and fix it if you can: "${title}"${refs.length ? ` (${refs.join("; ")})` : ""}. Check the bill photo if the paper decides it.`;
  return `/owner/assistant?q=${encodeURIComponent(prompt)}` as Route;
}

function Btn({ children, onClick, primary, busy }: { children: React.ReactNode; onClick: () => void; primary?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex h-9 items-center justify-center rounded-full px-4 text-sm transition active:scale-[.97] disabled:opacity-50 ${
        primary ? "bg-strow-ink text-white" : "border border-neutral-300 bg-white text-neutral-700"
      }`}
    >
      {busy ? <span className="ai-dots" aria-hidden><i /><i /><i /></span> : children}
    </button>
  );
}

export function ActionButtons({
  id,
  status,
  hasOps,
  title,
  entityTable,
  entityId,
  refresh = true,
  onStatus,
  ar = false,
}: {
  id: string;
  status: string;
  hasOps: boolean;
  title: string;
  entityTable?: string | null;
  entityId?: string | null;
  refresh?: boolean;
  onStatus?: (s: string) => void;
  ar?: boolean;
}) {
  const router = useRouter();
  const [st, setSt] = useState(status);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [photo, setPhoto] = useState(false);

  async function decide(decision: "approve" | "reject" | "undo") {
    setBusy(decision);
    setErr(null);
    try {
      const r = await fetch("/api/ai/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "That didn't work");
      const next = j.status ?? st;
      setSt(next);
      onStatus?.(next);
      if (refresh) router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const bill = entityId && (entityTable === "expenses" || entityTable === "closings") ? photoSrc(entityTable, entityId) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {st === "applied" ? (
        <Btn onClick={() => decide("undo")} busy={busy === "undo"}>
          {ar ? "تراجع" : "Undo"}
        </Btn>
      ) : null}
      {st === "proposed" && hasOps ? (
        <Btn primary onClick={() => decide("approve")} busy={busy === "approve"}>
          Approve
        </Btn>
      ) : null}
      {(st === "proposed" && !hasOps) || st === "info" ? (
        <Link href={askAiHref(title, entityTable, entityId, id)} className="inline-flex h-9 items-center justify-center rounded-full bg-strow-ink px-4 text-sm text-white transition active:scale-[.97]">
          ✦ Ask AI
        </Link>
      ) : null}
      {st === "proposed" || st === "info" ? (
        <Btn onClick={() => decide("reject")} busy={busy === "reject"}>
          Dismiss
        </Btn>
      ) : null}
      {bill ? <Btn onClick={() => setPhoto(true)}>View bill</Btn> : null}
      {err ? <p className="w-full text-xs text-red-600">{err}</p> : null}
      {photo && bill ? <PhotoViewer src={bill} caption={title} onClose={() => setPhoto(false)} /> : null}
    </div>
  );
}

export function ActionCard({ a, refresh = false }: { a: ActionBlock; refresh?: boolean }) {
  const [st, setSt] = useState(a.status);
  const fin = (a.entityTable ?? "").startsWith("finance_");
  const finLabel: Record<string, string> = { applied: "تم", undone: "تم التراجع" };
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4" dir={fin ? "rtl" : undefined}>
      <div className="flex items-start gap-3">
        <StatusChip status={st} label={fin ? finLabel[st] : undefined} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-strow-ink">{a.title}</p>
          {a.detail ? <p className="mt-1 text-sm leading-relaxed text-neutral-600">{a.detail}</p> : null}
          {a.confidence != null && st !== "info" && !fin ? (
            <p className="mt-1 text-[11px] text-neutral-400">Confidence {Math.round(Number(a.confidence) * 100)}%</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3">
        <ActionButtons
          id={a.id}
          status={st}
          hasOps={a.opsCount > 0}
          title={a.title}
          entityTable={a.entityTable}
          entityId={a.entityId}
          refresh={refresh}
          onStatus={setSt}
          ar={fin}
        />
      </div>
    </div>
  );
}
