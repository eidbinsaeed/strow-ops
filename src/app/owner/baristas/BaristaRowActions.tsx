"use client";

import { useState, useTransition } from "react";
import {
  toggleOnShift,
  rotateBaristaPin,
  deactivateBarista,
  reactivateBarista,
  setBaristaSalary,
} from "./actions";

type BaristaRowActionsProps = {
  id: string;
  isActive: boolean;
  isOnShift: boolean;
  name: string;
  salary: number | null;
};

export function BaristaRowActions({
  id,
  isActive,
  isOnShift,
  name,
  salary,
}: BaristaRowActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggleShift() {
    setError(null);
    startTransition(async () => {
      const result = await toggleOnShift(id, isOnShift);
      if (result?.error) setError(result.error);
    });
  }

  function handleRotatePin() {
    setError(null);
    const newPin = window.prompt(`New 4-digit PIN for ${name}:`);
    if (!newPin) return;
    if (!/^\d{4}$/.test(newPin)) {
      setError("PIN must be 4 digits");
      return;
    }
    startTransition(async () => {
      const result = await rotateBaristaPin(id, newPin);
      if (result?.error) setError(result.error);
      else alert(`PIN updated for ${name}`);
    });
  }

  function handleSetSalary() {
    setError(null);
    const value = window.prompt(
      `Monthly salary (AED) for ${name}:`,
      salary != null ? String(salary) : "",
    );
    if (value === null) return;
    startTransition(async () => {
      const result = await setBaristaSalary(id, value);
      if (result?.error) setError(result.error);
    });
  }

  function handleDeactivate() {
    if (!window.confirm(`Deactivate ${name}? They will not be able to log in.`))
      return;
    setError(null);
    startTransition(async () => {
      const result = await deactivateBarista(id);
      if (result?.error) setError(result.error);
    });
  }

  function handleReactivate() {
    setError(null);
    startTransition(async () => {
      const result = await reactivateBarista(id);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {isActive ? (
        <>
          <button
            type="button"
            onClick={handleToggleShift}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            {isOnShift ? "End shift" : "Start shift"}
          </button>
          <button
            type="button"
            onClick={handleSetSalary}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            Salary
          </button>
          <button
            type="button"
            onClick={handleRotatePin}
            disabled={isPending}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            Rotate PIN
          </button>
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={isPending}
            className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            Deactivate
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handleReactivate}
          disabled={isPending}
          className="rounded-md border border-emerald-200 px-2.5 py-1 text-xs text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
        >
          Reactivate
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
