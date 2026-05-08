"use client";

import { useState, useEffect } from "react";

type NumpadProps = {
  onComplete: (pin: string) => void;
  pinLength?: number;
  /** Set true after a failed auth attempt to shake the dots and clear input. */
  shake?: boolean;
};

/**
 * Mobile-first 4-digit PIN entry keypad.
 *
 * - Auto-submits when `pinLength` digits are entered (default 4).
 * - Backspace button at bottom-right.
 * - Big tap targets (80px) for fat-finger ergonomics on phones.
 * - Used by the barista login page (and later by the owner dashboard
 *   when setting/rotating barista PINs).
 */
export function Numpad({ onComplete, pinLength = 4, shake = false }: NumpadProps) {
  const [pin, setPin] = useState("");
  const [shakeNow, setShakeNow] = useState(false);

  // External shake trigger (e.g. after wrong PIN)
  useEffect(() => {
    if (shake) {
      setShakeNow(true);
      const t = setTimeout(() => {
        setPin("");
        setShakeNow(false);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [shake]);

  const handleDigit = (digit: string) => {
    if (pin.length >= pinLength) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === pinLength) {
      // Tiny delay so the user sees the last dot fill in before submit
      setTimeout(() => {
        onComplete(next);
        setPin("");
      }, 180);
    }
  };

  const handleBackspace = () => {
    setPin((p) => p.slice(0, -1));
  };

  return (
    <div className="flex flex-col items-center gap-12">
      {/* PIN dots */}
      <div
        className={`flex gap-4 ${shakeNow ? "animate-[shake_0.4s_ease-in-out]" : ""}`}
      >
        {Array.from({ length: pinLength }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-all duration-150 ${
              i < pin.length
                ? "scale-110 border-strow-ink bg-strow-ink"
                : "border-neutral-300 bg-transparent"
            }`}
          />
        ))}
      </div>

      {/* Numpad grid: 1-9, then [empty | 0 | backspace] */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => handleDigit(String(n))}
            className="h-20 w-20 rounded-full text-3xl font-light tabular-nums transition-all hover:bg-neutral-100 active:scale-95 active:bg-neutral-200 select-none"
          >
            {n}
          </button>
        ))}
        <div aria-hidden /> {/* empty cell for grid alignment */}
        <button
          type="button"
          onClick={() => handleDigit("0")}
          className="h-20 w-20 rounded-full text-3xl font-light tabular-nums transition-all hover:bg-neutral-100 active:scale-95 active:bg-neutral-200 select-none"
        >
          0
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          aria-label="Backspace"
          disabled={pin.length === 0}
          className="flex h-20 w-20 items-center justify-center rounded-full text-2xl text-neutral-500 transition-all hover:bg-neutral-100 active:scale-95 active:bg-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent select-none"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
