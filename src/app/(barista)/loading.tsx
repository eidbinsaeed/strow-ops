/** Shown at once on every tap in the staff app, while the next screen's data loads. */
export default function StaffLoading() {
  const block = "animate-pulse rounded-[24px] bg-white/80";
  return (
    <main className="flex min-h-dvh flex-col px-6 py-6" aria-busy="true" aria-label="Loading">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-24 animate-pulse rounded-full bg-neutral-300/50" />
          <div className="h-5 w-36 animate-pulse rounded-full bg-neutral-300/60" />
        </div>
        <div className="h-9 w-20 animate-pulse rounded-full bg-neutral-300/40" />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 py-12">
        <div className={`${block} h-20`} />
        <div className={`${block} h-20`} />
        <div className={`${block} h-20`} />
        <div className={`${block} h-14`} />
      </div>
    </main>
  );
}
