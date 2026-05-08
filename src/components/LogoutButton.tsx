"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/barista-logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("logout error:", err);
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="rounded-full px-4 py-2 text-sm text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
