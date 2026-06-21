"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Numpad } from "@/components/Numpad";

export default function BaristaLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handlePinComplete = async (pin: string) => {
    if (busy) return;
    const id = code.trim();
    if (!/^\d{3,6}$/.test(id)) {
      triggerShake();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/barista-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: id, pin }),
      });
      if (res.ok) {
        router.push("/home");
        router.refresh();
        return;
      }
      triggerShake();
    } catch (err) {
      console.error("login error:", err);
      triggerShake();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="mb-10 flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-light tracking-tight">Strow Ops</h1>
        <p className="text-sm text-neutral-500">Enter your ID code, then your PIN</p>
      </div>

      <div className="mb-10 w-full max-w-[220px]">
        <label
          htmlFor="code"
          className="mb-1 block text-center text-xs uppercase tracking-wider text-neutral-500"
        >
          ID code
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="e.g. 1101"
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center text-lg tracking-[0.3em] tabular-nums outline-none focus:border-strow-ink"
        />
      </div>

      <p className="mb-4 text-sm text-neutral-500">PIN</p>
      <Numpad onComplete={handlePinComplete} shake={shake} />

      <Link
        href="/owner"
        className="mt-12 rounded-full border border-neutral-300 px-6 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 active:bg-neutral-200"
      >
        Owner login
      </Link>
    </main>
  );
}
