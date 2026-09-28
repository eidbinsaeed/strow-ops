/** Chat outline while the conversation loads. */
export default function AssistantLoading() {
  return (
    <div className="flex h-dvh flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-2.5 border-b border-neutral-200 bg-white px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <span className="ai-orb h-8 w-8 shrink-0" aria-hidden />
        <div className="h-4 w-28 animate-pulse rounded-full bg-neutral-200" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="ms-auto h-10 w-2/3 animate-pulse rounded-2xl bg-neutral-200/70" />
        <div className="h-24 w-5/6 animate-pulse rounded-2xl bg-white/80" />
      </div>
    </div>
  );
}
