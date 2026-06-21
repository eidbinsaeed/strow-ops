"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { acknowledgeReport } from "./actions";

type Report = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  severity: string | null;
  occurred_on: string;
  acknowledged_at: string | null;
};

const KIND_LABEL: Record<string, string> = {
  warning: "Warning",
  incident: "Incident",
  note: "Note",
  commendation: "Commendation",
};
const badge: Record<string, string> = {
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  incident: "bg-red-50 text-red-700 border-red-200",
  note: "bg-neutral-100 text-neutral-600 border-neutral-200",
  commendation: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function MyRecord({ reports }: { reports: Report[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function ack(id: string) {
    start(async () => {
      await acknowledgeReport(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-medium">My warnings &amp; reports</h2>
      {reports.length === 0 ? (
        <p className="text-sm text-neutral-400">Nothing on file. Keep it up 👍</p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const needsAck =
              (r.kind === "warning" || r.kind === "incident") && !r.acknowledged_at;
            return (
              <div
                key={r.id}
                className={
                  "rounded-xl border p-3 " +
                  (needsAck ? "border-amber-300 bg-amber-50/40" : "border-neutral-200")
                }
              >
                <span
                  className={
                    "inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium " +
                    (badge[r.kind] ?? badge.note)
                  }
                >
                  {KIND_LABEL[r.kind] ?? "Note"}
                  {r.severity ? " · " + r.severity : ""}
                </span>
                <div className="mt-1 font-medium">{r.title}</div>
                {r.detail && (
                  <div className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-600">
                    {r.detail}
                  </div>
                )}
                <div className="mt-1 text-xs text-neutral-400">{r.occurred_on}</div>
                {(r.kind === "warning" || r.kind === "incident") &&
                  (r.acknowledged_at ? (
                    <div className="mt-2 text-xs font-medium text-emerald-700">
                      ✓ Acknowledged on {r.acknowledged_at.slice(0, 10)}
                    </div>
                  ) : (
                    <button
                      onClick={() => ack(r.id)}
                      disabled={pending}
                      className="mt-2 rounded-lg bg-strow-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      I acknowledge receipt
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
