"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Numpad } from "@/components/Numpad";

export default function BaristaLoginPage() {
  const router = useRouter();
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  const handlePinComplete = async (pin: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/barista-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.push("/home");
        router.refresh();
        return;
      }
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } catch (err) {
      console.error("login error:", err);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="mb-14 flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-light tracking-tight">Strow Ops</h1>
        <p className="text-sm text-neutral-500">Enter your PIN</p>
      </div>
      <Numpad onComplete={handlePinComplete} shake={shake} />
    </main>
  );
}
