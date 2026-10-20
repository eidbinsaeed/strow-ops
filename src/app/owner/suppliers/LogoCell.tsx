"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SupplierLogo } from "@/components/owner/SupplierLogo";
import { shrinkLogoFile } from "@/lib/logo-crop";
import { removeSupplierLogo, uploadSupplierLogo } from "./actions";

/** A vendor's logo with Add / Change / Remove. Logos picked here are shrunk on the phone first. */
export function LogoCell({
  id,
  name,
  category,
  logoPath,
  version,
  source,
}: {
  id: string;
  name: string;
  category: string | null;
  logoPath: string | null;
  version: string | null;
  source: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setErr(null);
    const data = await shrinkLogoFile(file);
    if (input.current) input.current.value = "";
    if (!data) return setErr("Couldn't open that image");
    start(async () => {
      const r = await uploadSupplierLogo(id, data);
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <SupplierLogo id={id} name={name} category={category} logoPath={logoPath} version={version} size={44} />
      <div className="flex flex-col items-start gap-0.5 text-xs">
        <span className="text-neutral-500">{logoPath ? (source === "bill" ? "From a bill" : "Uploaded") : "No logo yet"}</span>
        <span className="flex gap-3">
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className="min-h-8 font-semibold text-strow-ink underline disabled:opacity-50">
            {pending ? "Saving…" : logoPath ? "Change" : "Add logo"}
          </button>
          {logoPath ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Remove ${name}'s logo?`)) return;
                start(async () => {
                  const r = await removeSupplierLogo(id);
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
        <input ref={input} type="file" accept="image/*" className="hidden" aria-label={`Logo for ${name}`} onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}
