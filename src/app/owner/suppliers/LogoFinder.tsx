"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cropLogo } from "@/lib/logo-crop";
import type { LogoBox } from "@/lib/logo-box";
import { saveLogoFromBill } from "./actions";

type Todo = { id: string; name: string };
type Result = { id: string; name: string; status: "found" | "none" | "error"; logo?: string; reason?: string };
type FindReply = { status?: string; box?: LogoBox; photo?: string; reason?: string; error?: string };

/**
 * One button that looks at each vendor's latest bill photo, finds its printed
 * logo, cuts it out here in the browser and saves it. Each vendor is looked at
 * once, at about a cent a photo.
 */
export function LogoFinder({ todo }: { todo: Todo[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [err, setErr] = useState<string | null>(null);

  if (!todo.length && !results.length) return null;

  async function run() {
    setRunning(true);
    setErr(null);
    setResults([]);
    try {
      for (const s of todo) {
        setNow(s.name);
        const res = await fetch("/api/suppliers/logo-find", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supplierId: s.id }),
        });
        const j = (await res.json().catch(() => ({}))) as FindReply;
        if (res.status === 401 || res.status === 402 || res.status === 500) {
          setErr(j.error ?? j.reason ?? `Stopped (error ${res.status})`);
          break;
        }
        if (j.status === "found" && j.box && j.photo) {
          const logo = await cropLogo(j.photo, j.box);
          const saved = logo ? await saveLogoFromBill(s.id, logo) : null;
          if (logo && saved && !("error" in saved && saved.error)) setResults((r) => [...r, { id: s.id, name: s.name, status: "found", logo }]);
          else setResults((r) => [...r, { id: s.id, name: s.name, status: "error", reason: "Couldn't cut the logo out" }]);
        } else if (j.status === "error") {
          setResults((r) => [...r, { id: s.id, name: s.name, status: "error", reason: j.reason }]);
        } else {
          setResults((r) => [...r, { id: s.id, name: s.name, status: "none", reason: j.reason }]);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setNow(null);
      setRunning(false);
      router.refresh();
    }
  }

  const found = results.filter((r) => r.status === "found");
  const none = results.filter((r) => r.status === "none").length;
  const failed = results.filter((r) => r.status === "error");

  return (
    <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Logos from past bills</h2>
          <p className="text-sm text-neutral-500">
            {running
              ? `Looking at ${now ?? "…"} · ${results.length + 1} of ${todo.length}`
              : results.length
                ? `${found.length} logo${found.length === 1 ? "" : "s"} found · ${none} vendor${none === 1 ? "" : "s"} with no printed logo`
                : `${todo.length} vendor${todo.length === 1 ? " has" : "s have"} bill photos but no logo yet. About 1 cent a vendor.`}
          </p>
        </div>
        {todo.length && !running ? (
          <button type="button" onClick={() => void run()} className="h-11 rounded-full bg-strow-ink px-5 text-sm font-semibold text-white">
            {results.length ? "Look again" : "Find logos"}
          </button>
        ) : null}
      </div>
      {found.length ? (
        <div className="flex flex-wrap gap-3">
          {found.map((r) => (
            <div key={r.id} className="flex w-[104px] flex-col items-center gap-1.5 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.logo} alt="" className="h-14 w-full rounded-xl bg-white object-contain p-1 ring-1 ring-black/[0.07]" />
              <span className="line-clamp-2 text-[11px] leading-tight text-neutral-600">{r.name}</span>
            </div>
          ))}
        </div>
      ) : null}
      {found.length ? <p className="text-xs text-neutral-500">A wrong cut? Use Change or Remove on that vendor below.</p> : null}
      {failed.length ? <p className="text-xs text-red-600">{failed.map((f) => `${f.name}: ${f.reason ?? "error"}`).join(" · ")}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </section>
  );
}
