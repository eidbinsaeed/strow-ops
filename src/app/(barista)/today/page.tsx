import { redirect } from "next/navigation";
import Link from "next/link";
import { getBaristaSession } from "@/lib/auth/session";

export default async function BaristaTodayPage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  return (
    <main className="flex min-h-dvh flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Link
          href="/home"
          className="text-sm text-neutral-500 transition hover:text-strow-ink"
        >
          ← Back
        </Link>
        <p className="text-sm text-neutral-500">Today</p>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 py-10">
        <h1 className="mb-1 text-xl font-medium">Your submissions today</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Closings and expenses you have submitted today.
        </p>

        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
          <p className="text-sm text-neutral-500">
            Nothing submitted yet today.
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Submissions appear here after closing flow ships next session.
          </p>
        </div>
      </div>
    </main>
  );
}
