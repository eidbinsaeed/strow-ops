"use client";

import { useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { staffCreateMenuItem } from "./actions";

const field = "h-11 w-full rounded-xl border border-neutral-300 bg-[#F7F8FA] px-3 text-[15px] text-strow-ink";

/** Name and section only; the editor page then takes the ingredients one by one. */
export function NewRecipeForm({ sections }: { sections: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-dashed border-neutral-400 bg-white text-[15px] font-semibold text-strow-blue">
        + New recipe
      </button>
    );
  }
  return (
    <form
      action={(fd) => {
        setError(null);
        start(async () => {
          const r = await staffCreateMenuItem(fd);
          if (!r.ok) return setError(r.error ?? "Could not add.");
          router.push(`/recipes/${r.id}` as Route);
        });
      }}
      className="flex flex-col gap-3 rounded-2xl border border-neutral-300 bg-white p-4"
    >
      <p className="text-[15px] font-semibold">New recipe</p>
      <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-500">
        Name
        <input name="name" required maxLength={120} dir="auto" autoFocus className={field} placeholder="e.g. Iced Pistachio Latte" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-500">
        Section
        <input name="section" list="new-recipe-sections" maxLength={60} className={field} placeholder="Hot coffee, V60, Desserts…" />
        <datalist id="new-recipe-sections">
          {sections.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button disabled={pending} className="min-h-11 rounded-xl bg-strow-blue px-5 text-[15px] font-semibold text-white disabled:opacity-60">
          {pending ? "Adding…" : "Add, then ingredients"}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-[15px] font-semibold text-strow-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
