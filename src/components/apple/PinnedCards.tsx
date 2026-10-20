"use client";

/**
 * Charts and tables pinned from Strow AI. Live ones were rebuilt from their
 * SQL when the page loaded; the rest are snapshots from the day they were
 * pinned. Tapping a number or a bar ("Ask why") opens Strow AI with that
 * question. Remove takes it off Home (the others slide up).
 */
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState } from "react";
import { Chart, DataTable } from "@/components/ai/Charts";
import { ChatToolsProvider } from "@/components/ai/ChatTools";
import { FlipList } from "@/components/motion/FlipList";
import type { ChartBlock, TableBlock } from "@/lib/ai/types";

export type PinView = { id: string; block: ChartBlock | TableBlock; live: boolean; asOf: string };

function when(iso: string, ar: boolean) {
  const d = new Date(iso);
  return d.toLocaleDateString(ar ? "ar-AE" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });
}

export function PinnedCards({ pins, ar, className = "" }: { pins: PinView[]; ar: boolean; className?: string }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const list = pins.filter((p) => !gone.includes(p.id));
  if (!list.length) return null;

  const remove = async (id: string) => {
    setBusy(id);
    const r = await fetch(`/api/ai/pins?id=${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (r?.ok) {
      setGone((g) => [...g, id]);
      router.refresh();
    }
  };
  const ask = (q: string) => router.push(`/owner/assistant?q=${encodeURIComponent(q)}` as Route);

  return (
    <section data-reveal="" className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3 px-1 pb-2 pt-1">
        <h2 className="text-[20px] font-bold leading-[25px]">{ar ? "مثبّت من Strow AI" : "Pinned from Strow AI"}</h2>
      </div>
      <ChatToolsProvider value={{ ask, canPin: false }}>
        <FlipList className="flex flex-col gap-3">
          {list.map((p) => {
            const extra = (
              <div className="mt-1 flex items-center gap-2 text-[12px]">
                {p.live ? (
                  <span className="flex items-center gap-1 font-semibold text-[#008932]">
                    <i className="inline-block h-1.5 w-1.5 rounded-full bg-[#008932]" />
                    {ar ? "مباشر" : "Live"}
                  </span>
                ) : (
                  <span className="text-neutral-500">{ar ? `لقطة · ${when(p.asOf, ar)}` : `Snapshot · ${when(p.asOf, ar)}`}</span>
                )}
                <button type="button" disabled={busy === p.id} onClick={() => remove(p.id)} className="font-semibold text-neutral-500 disabled:opacity-40">
                  {ar ? "إزالة" : "Remove"}
                </button>
              </div>
            );
            return (
              <div key={p.id} data-flip-id={p.id}>
                {p.block.type === "chart" ? <Chart block={p.block} frame="apple" extra={extra} /> : <DataTable block={p.block} frame="apple" extra={extra} />}
              </div>
            );
          })}
        </FlipList>
      </ChatToolsProvider>
    </section>
  );
}
