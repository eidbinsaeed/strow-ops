import { redirect } from "next/navigation";
import Link from "next/link";
import { getBaristaSession } from "@/lib/auth/session";
import { LogoutButton } from "@/components/LogoutButton";

export default async function BaristaHomePage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const firstName = session.name.split(" ")[0];

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
      </div>

      <footer className="text-center text-xs text-neutral-400">
        Strow Ops · v0.0.5
      </footer>
    </main>
  );
}
