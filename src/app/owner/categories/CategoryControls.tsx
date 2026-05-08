"use client";

import { useRef, useState, useTransition } from "react";
import {
  createCategory,
  deactivateCategory,
  reactivateCategory,
} from "./actions";

type Category = { id: string; name: string };

export function AddCategoryForm({ parents }: { parents: Category[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCategory(formData);
      if (result?.error) setError(result.error);
      else formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4"
    >
      <p className="mb-3 text-sm font-medium">Add a category</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_240px_auto]">
        <input
          name="name"
          placeholder="Category name (e.g. Coffee Beans)"
          required
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <select
          name="parent_id"
          disabled={isPending}
          defaultValue=""
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        >
          <option value="">Top-level (no parent)</option>
          {parents.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}

export function CategoryRowActions({
  id,
  name,
  isActive,
}: {
  id: string;
  name: string;
  isActive: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    if (
      isActive &&
      !window.confirm(
        `Deactivate "${name}"? Suppliers and expenses pointing here will keep working but you will not be able to use it for new entries.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = isActive
        ? await deactivateCategory(id)
        : await reactivateCategory(id);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={`rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
          isActive
            ? "border-red-200 text-red-600 hover:bg-red-50"
            : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        }`}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
