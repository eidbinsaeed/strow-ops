"use client";

import { useState } from "react";

/** Copies a ready-made message (the order list) for pasting into WhatsApp. */
export function CopyText({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#C5CBD3] bg-white px-4 text-[15px] font-semibold text-strow-ink transition active:scale-[0.98]"
    >
      {copied ? done : label}
    </button>
  );
}
