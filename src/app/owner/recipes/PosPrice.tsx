"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyPosPrice, fillPricesFromPos } from "./actions";

const btn = "flex min-h-10 shrink-0 items-center rounded-full bg-strow-ink px-4 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50";
const money = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Recipe page: the price the POS charged, with one tap to use it. */
export function PosPriceHint({
  menuItemId,
  posPrice,
  posDay,
  current,
  locale,
}: {
  menuItemId: string;
  posPrice: number;
  posDay: string;
  current: number | null;
  locale: "en" | "ar";
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (current != null && Math.abs(current - posPrice) < 0.005) return null;
  const text =
    current == null
      ? ar
        ? `باعه نظام نقاط البيع بسعر ${money(posPrice)} (${posDay}).`
        : `The POS sold this at ${money(posPrice)} (${posDay}).`
      : ar
        ? `سعر نقاط البيع ${money(posPrice)} (${posDay})، والسعر في Strow ${money(current)}.`
        : `The POS charged ${money(posPrice)} on ${posDay}; Strow has ${money(current)}.`;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] bg-[#E3EAFB] px-4 py-3 text-sm leading-relaxed text-[#1A3FA8]">
      <span className="min-w-0 flex-[1_1_220px]">{text}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await applyPosPrice(menuItemId);
            if ("error" in res && res.error) setError(res.error);
            else router.refresh();
          });
        }}
        className={btn}
      >
        {pending ? (ar ? "جاري الحفظ…" : "Saving…") : ar ? `استخدم ${money(posPrice)}` : `Use ${money(posPrice)}`}
      </button>
      {error ? <span className="w-full text-[13px] text-[#9A1B12]">{error}</span> : null}
    </div>
  );
}

/** Cost cards: fill every missing price the POS knows, in one tap. */
export function FillPosPrices({ count, locale }: { count: number; locale: "en" | "ar" }) {
  const ar = locale === "ar";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          start(async () => {
            const res = await fillPricesFromPos();
            if ("error" in res && res.error) setMsg(res.error);
            else router.refresh();
          });
        }}
        className={btn}
      >
        {pending
          ? ar ? "جاري التعبئة…" : "Filling…"
          : ar
            ? `أكمل ${count} ${count === 1 ? "سعر" : "أسعار"} من نقاط البيع`
            : `Fill ${count} ${count === 1 ? "price" : "prices"} from the POS`}
      </button>
      {msg ? <span className="text-[13px] text-[#9A1B12]">{msg}</span> : null}
    </span>
  );
}
