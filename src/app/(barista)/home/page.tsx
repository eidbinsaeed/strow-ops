import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function BaristaHomePage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const firstName = session.name.split(" ")[0];

  const supabase = createServiceClient();
  const [{ data: meRow }, { data: notifs }] = await Promise.all([
    supabase.from("baristas").select("role").eq("id", session.bid).maybeSingle(),
    supabase
      .from("staff_reports")
      .select("id")
      .eq("barista_id", session.bid)
      .in("kind", ["warning", "incident"])
      .is("acknowledged_at", null),
  ]);
  const role = ((meRow as { role?: string } | null)?.role ?? "barista").toLowerCase();
  const canOperate = role !== "waiter";
  const notifCount = (notifs ?? []).length;

  return (
    <main className="flex min-h-dvh flex-col px-6 py-6">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            Logged in as
          </p>
          <p className="text-lg font-medium">{session.name}</p>
        </div>
        <LogoutButton />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 py-12">
        <p className="mb-2 text-center text-sm text-neutral-500">
          Hello, {firstName} 👋
        </p>

        {canOperate && (
          <>
            <Link
              href="/close"
              className="block rounded-2xl bg-strow-ink px-6 py-7 text-center text-lg font-medium text-white shadow-sm transition active:scale-[0.98]"
            >
              End of Day Close
              <span className="mt-1 block text-xs font-normal opacity-70">
                Photograph the closing sheet
              </span>
            </Link>

            <Link
              href="/expense"
              className="block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
            >
              Log Expense
              <span className="mt-1 block text-xs font-normal text-neutral-500">
                Photograph a receipt or invoice
              </span>
            </Link>

            <Link
              href={"/report-absence" as Route}
              className="block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
            >
              Report Absence
              <span className="mt-1 block text-xs font-normal text-neutral-500">
                Mark a waiter absent for a day
              </span>
            </Link>
          </>
        )}

        <Link
          href={"/me/record" as Route}
          className="relative block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
        >
          {notifCount > 0 && (
            <span className="absolute right-4 top-4 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
              {notifCount}
            </span>
          )}
          My Record
          <span className="mt-1 block text-xs font-normal text-neutral-500">
            Attendance, warnings &amp; notifications
          </span>
        </Link>

        <Link
          href={"/me" as Route}
          className="block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
        >
          My Account
          <span className="mt-1 block text-xs font-normal text-neutral-500">
            Photo, phone &amp; password
          </span>
        </Link>
      </div>

      <footer className="text-center text-xs text-neutral-400">
        Strow Ops · v0.0.5
      </footer>
    </main>
  );
}
