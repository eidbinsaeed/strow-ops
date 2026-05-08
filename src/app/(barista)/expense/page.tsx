import Link from "next/link";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { ExpenseFlow } from "./ExpenseFlow";

export const dynamic = "force-dynamic";

export default async function ExpensePage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const supabase = createServiceClient();
  const [suppliersResult, categoriesResult] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("location_id", session.lid)
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const suppliers = (suppliersResult.data ?? []) as {
    id: string;
    name: string;
  }[];
  const categories = (categoriesResult.data ?? []) as {
    id: string;
    name: string;
  }[];

  return (
    <main className="flex min-h-dvh flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Link
          href="/home"
          className="text-sm text-neutral-500 transition hover:text-strow-ink"
        >
          ← Back
        </Link>
        <p className="text-sm text-neutral-500">{session.name}</p>
      </header>

      <ExpenseFlow
        baristaName={session.name}
        suppliers={suppliers}
        categories={categories}
      />
    </main>
  );
}
