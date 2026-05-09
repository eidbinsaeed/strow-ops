"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "./LocaleProvider";
import { tr } from "@/lib/i18n/tr";

export function LangToggle() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = locale === "ar" ? "en" : "ar";
    startTransition(async () => {
      await fetch("/api/lang", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: next }),
      });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50"
      title={locale === "ar" ? "Switch to English" : "التبديل للعربية"}
    >
      {tr("lang.toggle", locale)}
    </button>
  );
}
