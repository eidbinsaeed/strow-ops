import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import { AddCategoryForm, CategoryRowActions } from "./CategoryControls";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CategoryRow = {
  id: string;
  name: string;
  is_active: boolean;
  parent_id: string | null;
  created_at: string;
};

export default async function OwnerCategoriesPage() {
  const locale = await getLocale();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, is_active, parent_id, created_at")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  const categories = (data ?? []) as CategoryRow[];
  const activeParents = categories.filter((c) => c.is_active);
  const activeCount = activeParents.length;

  // Build a name lookup so we can show parent name on the row.
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-light tracking-tight">{tr("page.coa", locale)}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {activeCount} active · {categories.length - activeCount} inactive
        </p>
      </header>

      <AddCategoryForm parents={activeParents} />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load categories: {error.message}
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">No categories yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Parent</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {categories.map((c) => (
                <tr key={c.id} className="text-sm">
                  <td className="px-5 py-4 font-medium">{c.name}</td>
                  <td className="px-5 py-4 text-neutral-600">
                    {c.parent_id ? nameById.get(c.parent_id) ?? "—" : "—"}
                  </td>
                  <td className="px-5 py-4">
                    {c.is_active ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-neutral-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <CategoryRowActions
                      id={c.id}
                      name={c.name}
                      isActive={c.is_active}
                    />
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
