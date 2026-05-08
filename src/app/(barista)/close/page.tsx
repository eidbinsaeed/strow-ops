import { redirect } from "next/navigation";
import Link from "next/link";
import { getBaristaSession } from "@/lib/auth/session";

export default async function ClosePage() {
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
              d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.823-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-xl font-medium">End of Day Close</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Photo capture and AI extraction land in the next session.
          </p>
          <p className="mt-4 text-xs text-neutral-400">
            You will tap a big camera button, take a photo of the close sheet,
            review the extracted totals, and confirm. Under 30 seconds.
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
