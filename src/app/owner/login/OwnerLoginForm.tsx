"use client";

import { useState, useTransition } from "react";
import { requestOwnerMagicLink } from "./actions";

export function OwnerLoginForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  function handle(formData: FormData) {
    setError(null);
    setConfirmation(null);
    startTransition(async () => {
      const result = await requestOwnerMagicLink(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("message" in result && result.message) {
        setConfirmation(result.message);
      }
    });
  }

  return (
    <form action={handle} className="space-y-3">
      <input
        type="email"
        name="email"
        required
        autoFocus
        autoComplete="email"
        placeholder="you@example.com"
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:border-strow-ink focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-strow-ink px-4 py-2.5 text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send magic link"}
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}
      {confirmation && (
        <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">
          {confirmation}
        </div>
      )}
    </form>
  );
}
