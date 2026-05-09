"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Numpad } from "@/components/Numpad";

export function OwnerLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handlePin(pin: string) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/owner-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.replace("/owner");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        data.error === "invalid_pin"
          ? "Wrong PIN. Try again."
          : "Could not sign in. Try again.",
      );
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } catch {
      setError("Network error. Try again.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <Numpad onComplete={handlePin} pinLength={4} shake={shake} />
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
