import { redirect } from "next/navigation";
import Link from "next/link";
import { getBaristaSession } from "@/lib/auth/session";

export default async function ExpensePage() {
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
        <p className="text-sm text-neutral-500">{session.name}</p>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-neutral-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-10 w-10 text-neutral-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-xl font-medium">Log Expense</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Photo capture and AI extraction land in the next session.
          </p>
          <p className="mt-4 text-xs text-neutral-400">
            Tap to photograph any supplier invoice or receipt. The AI will
            extract supplier, line items, totals, VAT split, and date.
            You glance at the form, fix anything wrong, confirm.
          </p>
        </div>

        <Link
          href="/home"
          className="rounded-full bg-strow-ink px-6 py-3 text-sm font-medium text-white transition active:scale-95"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
