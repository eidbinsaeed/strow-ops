"use client";

import { useEffect, useState } from "react";

export function photoSrc(table: string, id: string): string {
  return `/api/ai/photo?table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`;
}

/** Full-screen bill photo viewer — pinch to zoom on phones, tap × or outside to close. */
export function PhotoViewer({ src, caption, onClose }: { src: string; caption?: string | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="ai-fade fixed inset-0 z-[80] flex flex-col bg-black/95" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <p className="min-w-0 truncate text-sm">{caption ?? "Bill photo"}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl leading-none">
          ×
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-2" style={{ touchAction: "pinch-zoom pan-x pan-y" }} onClick={(e) => e.stopPropagation()}>
        {!loaded && !failed ? <span className="ai-dots absolute" aria-hidden><i /><i /><i /></span> : null}
        {failed ? (
          <p className="text-sm text-white/70">Couldn&apos;t load this photo from Drive.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={caption ?? "Bill photo"} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className={`max-h-full max-w-full object-contain transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`} />
        )}
      </div>
      <div className="flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <a href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="rounded-full bg-white/15 px-4 py-2 text-sm text-white">
          Open full size
        </a>
      </div>
    </div>
  );
}

/** A tappable bill thumbnail inside the chat. */
export function BillCard({ table, id, caption }: { table: string; id: string; caption?: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = photoSrc(table, id);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group block w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white text-start">
        {failed ? (
          <div className="flex h-32 items-center justify-center text-sm text-neutral-400">Photo not available</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={caption ?? "Bill"} loading="lazy" onError={() => setFailed(true)} className="h-52 w-full bg-neutral-100 object-cover object-top transition group-active:scale-[.99]" />
        )}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <span className="truncate text-sm text-neutral-700">{caption ?? "Bill photo"}</span>
          <span className="shrink-0 text-xs text-neutral-400">Tap to zoom</span>
        </div>
      </button>
      {open ? <PhotoViewer src={src} caption={caption} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
