import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { LogoutButton } from "@/components/LogoutButton";

export default async function BaristaHomePage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const firstName = session.name.split(" ")[0];

  return (
    <main className="flex min-h-dvh flex-col px-6 py-8">
      <header className="mb-12 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            Logged in as
          </p>
          <p className="text-lg font-medium">{session.name}</p>
        </div>
        <LogoutButton />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="mb-6 text-sm text-neutral-500">Hello, {firstName} 👋</p>

        <button
          type="button"
          disabled
          className="w-full max-w-sm rounded-2xl bg-strow-ink px-6 py-8 text-lg font-medium text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
        >
          End of Day Close
          <span className="mt-1 block text-xs font-normal opacity-70">
            Coming next session
          </span>
        </button>

        <button
          type="button"
          disabled
          className="w-full max-w-sm rounded-2xl border border-neutral-300 bg-white px-6 py-8 text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98] disabled:opacity-60"
        >
          Log Expense
          <span className="mt-1 block text-xs font-normal text-neutral-500">
            Coming next session
          </span>
        </button>
      </div>

      <footer className="mt-8 text-center text-xs text-neutral-400">
        Strow Ops · v0.0.4
      </footer>
    </main>
  );
}
