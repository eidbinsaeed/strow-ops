/** Shown instantly on every tap while the next page's data loads. */
export default function OwnerLoading() {
  const block = "animate-pulse rounded-[28px] bg-white/80";
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-44 animate-pulse rounded-full bg-neutral-300/60" />
          <div className="h-4 w-60 animate-pulse rounded-full bg-neutral-300/40" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${block} h-24`} />
          ))}
        </div>
        <div className={`${block} h-44`} />
        <div className={`${block} h-32`} />
      </div>
    </div>
  );
}
