"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ItemThumb } from "@/components/owner/ItemThumb";
import { shrinkPictureFile } from "@/lib/image-shrink";
import { removeItemPhoto, uploadItemPhoto } from "./photo-actions";

/** An item's photo with Add / Change / Remove. Tapping the photo picks a new one (camera or library). */
export function PhotoCell({
  id,
  name,
  kind,
  photoPath,
  version,
  source,
  page,
}: {
  id: string;
  name: string;
  kind: string | null;
  photoPath: string | null;
  version: string | null;
  source: string | null;
  page: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setErr(null);
    const data = await shrinkPictureFile(file);
    if (input.current) input.current.value = "";
    if (!data) return setErr("Couldn't open that image");
    start(async () => {
      const r = await uploadItemPhoto(id, data);
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  }

  let host = "";
  try {
    host = page ? new URL(page).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" disabled={pending} onClick={() => input.current?.click()} aria-label={photoPath ? `Change the photo of ${name}` : `Add a photo of ${name}`} className="rounded-[16px] disabled:opacity-50">
        <ItemThumb id={id} name={name} kind={kind} photoPath={photoPath} version={version} size={64} />
      </button>
      <div className="flex min-w-0 flex-col items-start gap-0.5 text-xs">
        <span className="truncate text-neutral-500">
          {photoPath
            ? source === "web"
              ? host
                ? <>From <a href={page ?? "#"} target="_blank" rel="noreferrer" className="underline">{host}</a></>
                : "From the web"
              : "Your photo"
            : "No photo yet"}
        </span>
        <span className="flex gap-3">
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className="min-h-8 font-semibold text-strow-ink underline disabled:opacity-50">
            {pending ? "Saving…" : photoPath ? "Change" : "Add photo"}
          </button>
          {photoPath ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Remove the photo of ${name}?`)) return;
                start(async () => {
                  const r = await removeItemPhoto(id);
                  if (r?.error) setErr(r.error);
                  else router.refresh();
                });
              }}
              className="min-h-8 text-neutral-500 underline disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
        </span>
        {err ? <span className="text-red-600">{err}</span> : null}
        <input ref={input} type="file" accept="image/*" className="hidden" aria-label={`Photo of ${name}`} onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}
