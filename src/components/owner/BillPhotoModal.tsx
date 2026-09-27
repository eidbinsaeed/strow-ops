"use client";

import { useEffect, useState } from "react";

import { Portal } from "@/components/pulse/Portal";
/**
 * Full-screen bill photo viewer. Loads the image through /api/bill-photo
 * (server-side Drive fetch) instead of a Google iframe, so it works on any
 * device without a Google login. Tap the photo to zoom to full resolution.
 */
export function BillPhotoModal({
  fileId,
  driveUrl,
  title,
  onClose,
  openInDriveLabel = "Open in Drive",
  closeLabel = "Close",
}: {
  fileId: string;
  driveUrl: string | null;
  title: string;
  onClose: () => void;
  openInDriveLabel?: string;
  closeLabel?: string;
}) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <Portal>
<div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-neutral-950 shadow-2xl sm:h-[88vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 text-white">
          <h2 className="min-w-0 truncate text-sm font-medium">{title}</h2>
          <div className="flex shrink-0 items-center gap-3 text-xs">
            {driveUrl && (
              <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="text-white/60 underline hover:text-white">
                {openInDriveLabel}
              </a>
            )}
            <button type="button" onClick={onClose} className="rounded-full bg-white/10 px-3 py-1.5 text-white hover:bg-white/20">
              {closeLabel}
            </button>
          </div>
        </div>

        <div className={`relative flex-1 ${zoomed ? "overflow-auto" : "flex items-center justify-center overflow-hidden"}`}>
          {state === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          )}
          {state === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/70">
              <p>This photo couldn't be loaded from Drive.</p>
              {driveUrl && (
                <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  {openInDriveLabel}
                </a>
              )}
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/bill-photo/${fileId}`}
            alt={title}
            onLoad={() => setState("ok")}
            onError={() => setState("error")}
            onClick={() => setZoomed((z) => !z)}
            className={`transition-opacity duration-300 ${state === "ok" ? "opacity-100" : "opacity-0"} ${
              zoomed ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"
            }`}
          />
        </div>
        {state === "ok" && (
          <p className="py-2 text-center text-[11px] text-white/40">{zoomed ? "Tap to fit" : "Tap to zoom"}</p>
        )}
      </div>
    </div>
</Portal>
  );
}
