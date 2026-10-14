"use client";

import { useState, useTransition } from "react";
import { setCanEditStockLists } from "./actions";

/** Switch: may this staff member edit the stock count lists? */
export function ListsPermission({ id, name, on }: { id: string; name: string; on: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function toggle() {
    setError(null);
    startTransition(async () => {
      const r = await setCanEditStockLists(id, !on);
      if (r?.error) setError(r.error);
    });
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${name} may edit the count lists`}
        onClick={toggle}
        disabled={isPending}
        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
          on ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-neutral-300"}`} />
        {on ? "Can edit" : "View only"}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
