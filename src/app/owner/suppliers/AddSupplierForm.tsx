"use client";

import { useRef, useState, useTransition } from "react";
import { createSupplier } from "./actions";

type Category = { id: string; name: string };

export function AddSupplierForm({ categories }: { categories: Category[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createSupplier(formData);
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
      <p className="mb-3 text-sm font-medium">Add a supplier</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <input
          name="name"
          placeholder="Supplier name (e.g. Fresh Beans LLC)"
          required
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <input
          name="trn"
          placeholder="TRN (optional)"
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <select
          name="category_id"
          disabled={isPending}
          defaultValue=""
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        >
          <option value="">Default category (optional)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          name="contact"
          placeholder="Contact phone or email (optional)"
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <input
          name="notes"
          placeholder="Notes (optional)"
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none md:col-span-2"
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add supplier"}
        </button>
      </div>
    </form>
  );
}
