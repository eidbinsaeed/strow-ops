import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import { AddSupplierForm } from "./AddSupplierForm";
import { DeleteSupplierButton } from "./DeleteSupplierButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SupplierRow = {
  id: string;
  name: string;
  trn: string | null;
  contact: string | null;
  notes: string | null;
  created_at: string;
  categories: { name: string } | null;
};

export default async function OwnerSuppliersPage() {
  const locale = await getLocale();
  const supabase = createServiceClient();

  const [suppliersResult, categoriesResult] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, trn, contact, notes, created_at, categories(name)")
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const suppliers = (suppliersResult.data ?? []) as unknown as SupplierRow[];
  const categories = (categoriesResult.data ?? []) as {
    id: string;
    name: string;
  }[];

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-light tracking-tight">{tr("page.vendors", locale)}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {suppliers.length} {suppliers.length === 1 ? "supplier" : "suppliers"}
        </p>
      </header>

      <AddSupplierForm categories={categories} />

      {suppliersResult.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not load suppliers: {suppliersResult.error.message}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <p className="text-sm text-neutral-500">
            No suppliers yet. Add your first one above.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">TRN</th>
                <th className="px-5 py-3 font-medium">Default category</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {suppliers.map((s) => (
                <tr key={s.id} className="text-sm">
                  <td className="px-5 py-4">
                    <div className="font-medium">{s.name}</div>
                    {s.notes && (
                      <div className="text-xs text-neutral-500">{s.notes}</div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">{s.trn ?? "—"}</td>
                  <td className="px-5 py-4 text-neutral-600">
                    {s.categories?.name ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-neutral-600">
                    {s.contact ?? "—"}
                  </td>
                  <td className="px-5 py-4">
                    <DeleteSupplierButton id={s.id} name={s.name} />
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
