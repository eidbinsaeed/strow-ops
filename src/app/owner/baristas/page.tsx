import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BaristaRow = {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  is_on_shift: boolean;
  created_at: string;
  locations: { name: string; slug: string } | null;
};

export default async function OwnerBaristasPage() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("baristas")
    .select("id, name, role, is_active, is_on_shift, created_at, locations(name, slug)")
    .order("created_at", { ascending: true });

  const baristas = (data ?? []) as unknown as BaristaRow[];

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Baristas</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {baristas.length} on the roster
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Add / edit / set PIN — next session
        </span>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load baristas: {error.message}
        </div>
      ) : baristas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">No baristas yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {baristas.map((b) => (
                <tr key={b.id} className="text-sm">
                  <td className="px-5 py-4 font-medium">{b.name}</td>
                  <td className="px-5 py-4 text-neutral-600">
                    {b.locations?.name ?? "—"}
                  </td>
                  <td className="px-5 py-4 capitalize text-neutral-600">
                    {b.role}
                  </td>
                  <td className="px-5 py-4">
                    {!b.is_active ? (
                      <span className="inline-flex items-center gap-1.5 text-neutral-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
                        Inactive
                      </span>
                    ) : b.is_on_shift ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        On shift
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-neutral-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
                        Off shift
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-neutral-500">
                    {new Date(b.created_at).toLocaleDateString("en-AE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
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
