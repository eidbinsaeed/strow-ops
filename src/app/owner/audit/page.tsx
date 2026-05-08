import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_type: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ACTION_STYLES: Record<string, string> = {
  created: "text-emerald-700 bg-emerald-50",
  updated: "text-blue-700 bg-blue-50",
  deleted: "text-red-700 bg-red-50",
  confirmed: "text-emerald-700 bg-emerald-50",
  rejected: "text-red-700 bg-red-50",
  flagged: "text-amber-700 bg-amber-50",
};

export default async function OwnerAuditPage() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, actor_id, actor_type, action, entity_type, entity_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const entries = (data ?? []) as AuditRow[];

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {entries.length === 200
              ? "Last 200 entries"
              : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Audit writes ship with submission flows
        </span>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load audit log: {error.message}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            No audit entries yet. Every meaningful state change — closing
            confirmed, expense edited, PIN rotated — will land here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Entity</th>
                <th className="px-5 py-3 font-medium">Actor</th>
                <th className="px-5 py-3 font-medium">Entity ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {entries.map((e) => (
                <tr key={e.id} className="text-sm">
                  <td className="px-5 py-4 text-neutral-600">
                    {formatDateTime(e.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        ACTION_STYLES[e.action] ??
                        "text-neutral-500 bg-neutral-100"
                      }`}
                    >
                      {e.action}
                    </span>
                  </td>
                  <td className="px-5 py-4 capitalize text-neutral-600">
                    {e.entity_type}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    <span className="capitalize">{e.actor_type ?? "—"}</span>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-neutral-400">
                    {e.entity_id.slice(0, 8)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">
          ← Dashboard
        </Link>
      </p>
    </div>
  );
}
