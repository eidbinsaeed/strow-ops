export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Strow Ops</h1>
        <p className="text-sm text-neutral-600">
          Phase 0 scaffold. Real routes coming in Phase 1.
        </p>
      </div>

      <div className="flex flex-col gap-3 text-sm text-neutral-700">
        <code className="rounded-md bg-neutral-100 px-3 py-2 font-mono">
          npm run dev
        </code>
        <p className="text-xs text-neutral-500">
          See <span className="font-mono">/docs/</span> for project state.
        </p>
      </div>
    </main>
  );
}
