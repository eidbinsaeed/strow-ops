"use client";

import { useRef, useState, useTransition } from "react";
import { createBarista } from "./actions";

export function AddBaristaForm() {
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await createBarista(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        if (result?.employee_code) setNote(`Added · ID code ${result.employee_code}`);
        formRef.current?.reset();
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4"
    >
      <p className="mb-3 text-sm font-medium">Add a staff member</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_130px_120px_110px_auto]">
        <input
          name="name"
          placeholder="Full name"
          required
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <select
          name="role"
          defaultValue="barista"
          disabled={isPending}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        >
          <option value="barista">Barista</option>
          <option value="waiter">Waiter</option>
          <option value="lead">Lead</option>
          <option value="manager">Manager</option>
        </select>
        <input
          name="pin"
          placeholder="4-digit PIN"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <input
          name="salary"
          placeholder="Salary"
          inputMode="decimal"
          disabled={isPending}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        An ID code is generated automatically. Salary (optional) feeds Fixed monthly.
      </p>
      {note && <p className="mt-1 text-xs text-emerald-600">{note}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </form>
  );
}
