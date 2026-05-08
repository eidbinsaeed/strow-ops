"use client";

import { useState, useTransition } from "react";
import { deleteSupplier } from "./actions";

export function DeleteSupplierButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !window.confirm(
        `Delete supplier "${name}"? Existing expenses pointing here will block deletion.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSupplier(id);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
      >
        Delete
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
