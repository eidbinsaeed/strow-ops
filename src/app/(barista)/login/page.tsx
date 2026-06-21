"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function BaristaLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(false);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/barista-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), password }),
      });
      if (res.ok) {
        router.push("/home");
        router.refresh();
        return;
      }
      setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="mb-10 flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-light tracking-tight">Strow Ops</h1>
        <p className="text-sm text-neutral-500">
          Sign in with your ID code and password
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full max-w-[280px] flex-col gap-3">
        <div>
          <label
            htmlFor="code"
            className="mb-1 block text-xs uppercase tracking-wider text-neutral-500"
          >
            ID code
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="username"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center text-lg tracking-widest tabular-nums outline-none focus:border-strow-ink"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-xs uppercase tracking-wider text-neutral-500"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center text-lg outline-none focus:border-strow-ink"
          />
        </div>

        {error && (
          <p className="text-center text-sm text-red-600">
            Incorrect ID code or password.
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !code || !password}
          className="mt-1 rounded-xl bg-strow-ink px-4 py-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <Link
        href="/owner"
        className="mt-10 rounded-full border border-neutral-300 px-6 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 active:bg-neutral-200"
      >
        Owner login
      </Link>
    </main>
  );
}
