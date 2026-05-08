import Link from "next/link";

export default function OwnerLoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-light tracking-tight">Strow Ops</h1>
          <p className="mt-1 text-sm text-neutral-500">Owner sign in</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <div className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Owner authentication wires next session — email magic link via
            Supabase Auth. For now the owner shell is open for navigation.
          </div>

          <div className="space-y-3">
            <input
              type="email"
              disabled
              placeholder="you@example.com"
              className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-400"
            />
            <button
              type="button"
              disabled
              className="w-full rounded-lg bg-strow-ink px-4 py-2.5 text-sm font-medium text-white opacity-50"
            >
              Send magic link
            </button>
          </div>

          <div className="mt-6 border-t border-neutral-200 pt-4 text-center">
            <Link
              href="/owner"
              className="text-sm text-neutral-500 underline hover:text-strow-ink"
            >
              Browse owner shell anyway
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-neutral-400">
          Barista? <Link href="/login" className="underline">Go to barista login</Link>
        </div>
      </div>
    </div>
  );
}
