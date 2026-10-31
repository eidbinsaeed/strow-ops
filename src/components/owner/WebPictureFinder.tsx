"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { shrinkPicture } from "@/lib/image-shrink";

type Todo = { id: string; name: string };
type Found = { id: string; name: string; pic: string; page: string; exact: boolean };
type Reply = { status?: string; dataUrl?: string; page?: string; exact?: boolean; reason?: string; error?: string };

/**
 * "Photos from the web" (items) and "Logos from the web" (vendors): goes through every one
 * without a picture, three at a time, and saves what it finds. Each is looked at once.
 * The owner changes or removes any wrong one on its row.
 */
export function WebPictureFinder({
  todo,
  endpoint,
  idKey,
  save,
  title,
  noun,
  hint,
}: {
  todo: Todo[];
  endpoint: string;
  idKey: "itemId" | "supplierId";
  save: (id: string, dataUrl: string, page: string | null) => Promise<{ error?: string; ok?: boolean; saved?: boolean }>;
  title: string;
  noun: { one: string; many: string };
  hint: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [found, setFound] = useState<Found[]>([]);
  const [missed, setMissed] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  if (!todo.length && !found.length && !missed.length) return null;

  async function one(t: Todo): Promise<"stop" | void> {
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [idKey]: t.id }) });
    const j = (await res.json().catch(() => ({}))) as Reply;
    if (res.status === 401 || res.status === 402 || res.status === 500) {
      setErr(j.error ?? j.reason ?? `Stopped (error ${res.status})`);
      return "stop";
    }
    if (j.status === "found" && j.dataUrl) {
      const pic = await shrinkPicture(j.dataUrl);
      const r = pic ? await save(t.id, pic, j.page ?? null) : null;
      if (pic && r && !r.error) setFound((f) => [...f, { id: t.id, name: t.name, pic, page: j.page ?? "", exact: !!j.exact }]);
      else setMissed((m) => [...m, t.name]);
    } else setMissed((m) => [...m, t.name]);
  }

  async function run() {
    setRunning(true);
    setErr(null);
    setDone(0);
    setFound([]);
    setMissed([]);
    let stop = false;
    const queue = [...todo];
    const worker = async () => {
      while (!stop && queue.length) {
        const t = queue.shift()!;
        try {
          if ((await one(t)) === "stop") stop = true;
        } catch {
          setMissed((m) => [...m, t.name]);
        }
        setDone((d) => d + 1);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setRunning(false);
    router.refresh();
  }

  const n = (x: number) => `${x} ${x === 1 ? noun.one : noun.many}`;
  return (
    <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-neutral-500">
            {running
              ? `Looking… ${done} of ${todo.length} · ${found.length} found`
              : found.length || missed.length
                ? `${found.length} found · ${missed.length} not found`
                : `${n(todo.length)} without one yet. ${hint}`}
          </p>
        </div>
        {todo.length && !running ? (
          <button type="button" onClick={() => void run()} className="h-11 rounded-full bg-strow-ink px-5 text-sm font-semibold text-white">
            {found.length || missed.length ? "Look again" : "Find them"}
          </button>
        ) : null}
      </div>
      {running ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-strow-blue transition-all" style={{ width: `${todo.length ? Math.round((done / todo.length) * 100) : 0}%` }} />
        </div>
      ) : null}
      {found.length ? (
        <div className="flex flex-wrap gap-3">
          {found.map((r) => (
            <div key={r.id} className="flex w-[88px] flex-col items-center gap-1 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.pic} alt="" className="h-[72px] w-[72px] rounded-xl bg-white object-cover ring-1 ring-black/[0.07]" />
              <span className="line-clamp-2 text-[11px] leading-tight text-neutral-600">{r.name}</span>
              {!r.exact ? <span className="text-[10px] text-amber-700">similar</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {found.length ? <p className="text-xs text-neutral-500">“similar” = not the exact product, a close match. A wrong one? Tap it on its row below to change or remove it.</p> : null}
      {missed.length && !running ? <p className="text-xs text-neutral-500">Not found: {missed.slice(0, 12).join(", ")}{missed.length > 12 ? ` and ${missed.length - 12} more` : ""} — add those by hand.</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </section>
  );
}
