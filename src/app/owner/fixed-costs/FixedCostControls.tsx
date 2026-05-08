"use client";

import { useRef, useState, useTransition } from "react";
import {
  createFixedCost,
  deactivateFixedCost,
  reactivateFixedCost,
} from "./actions";

type Barista = { id: string; name: string };

export function AddFixedCostForm({ baristas }: { baristas: Barista[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState("rent");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createFixedCost(formData);
      if (result?.error) setError(result.error);
      else {
        formRef.current?.reset();
        setKind("rent");
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4"
    >
      <p className="mb-3 text-sm font-medium">Add a fixed cost</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <input
          name="name"
          placeholder="Name (e.g. Rent — main location)"
          required
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none md:col-span-2"
        />
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          disabled={isPending}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        >
          <option value="rent">Rent</option>
          <option value="salary">Salary</option>
          <option value="utility">Utility</option>
          <option value="subscription">Subscription</option>
          <option value="other">Other</option>
        </select>
        <select
          name="frequency"
          defaultValue="monthly"
          disabled={isPending}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        >
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
          <option value="one_time">One time</option>
        </select>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0"
          placeholder="Amount in AED"
          required
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <input
          name="due_day"
          type="number"
          min="1"
          max="31"
          placeholder="Due day (1–31)"
          required
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        {kind === "salary" && (
          <select
            name="linked_barista_id"
            defaultValue=""
            disabled={isPending}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none md:col-span-2"
          >
            <option value="">Link to which barista? (optional)</option>
            {baristas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add fixed cost"}
        </button>
      </div>
    </form>
  );
}

export function FixedCostRowActions({
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
      !window.confirm(`Mark "${name}" as inactive? It will stop showing up.`)
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = isActive
        ? await deactivateFixedCost(id)
        : await reactivateFixedCost(id);
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
