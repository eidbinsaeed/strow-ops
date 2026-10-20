"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { HUB, PAGES } from "@/lib/sections";
import { useLocale } from "@/components/owner/LocaleProvider";
import { Chevron, LargeTitle, RowIcon } from "@/components/apple/ui";

/** Every owner page, by section; type to filter. */
export function SearchPages() {
  const ar = useLocale() === "ar";
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out: { title: string; items: typeof PAGES }[] = [];
    for (const p of PAGES) {
      const title = `${ar ? HUB[p.section].ar : HUB[p.section].en}${p.group.en !== HUB[p.section].en ? ` · ${ar ? p.group.ar : p.group.en}` : ""}`;
      const hay = `${p.en} ${p.ar} ${title} ${p.group.en}`.toLowerCase();
      if (ql && !hay.includes(ql)) continue;
      const g = out.find((o) => o.title === title);
      if (g) g.items.push(p);
      else out.push({ title, items: [p] });
    }
    return out;
  }, [q, ar]);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <LargeTitle title={ar ? "بحث" : "Search"} subtitle={ar ? "كل الصفحات في Strow" : "Every page in Strow"} />
      <label className="flex h-11 items-center gap-2 rounded-full bg-white px-3.5 text-neutral-500">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 20.5 20.5" />
        </svg>
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={ar ? "جرّب الفواتير أو الضريبة" : "Try bills or VAT"}
          aria-label={ar ? "ابحث في الصفحات" : "Search pages"}
          className="h-10 min-w-0 flex-1 bg-transparent text-[17px] text-strow-ink outline-none"
        />
      </label>
      {!groups.length ? <p className="px-4 text-[15px] text-neutral-500">{ar ? "لا توجد صفحة بهذا الاسم. جرّب كلمة أخرى." : "No page matches that. Try another word."}</p> : null}
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col">
          <h2 className="px-4 pb-2 text-[15px] font-semibold text-neutral-500">{g.title}</h2>
          <div className="apple-rows overflow-hidden rounded-3xl bg-white">
            {g.items.map((p) => (
              <Link key={p.href} href={p.href as Route} className="apple-row flex items-center gap-3 ps-4 active:bg-neutral-100">
                <RowIcon name={p.icon} color={p.color} />
                <span className="apple-row-body flex min-h-[50px] flex-1 items-center gap-2 pe-3.5 text-[17px]">
                  <span className="flex-1">{ar ? p.ar : p.en}</span>
                  <Chevron />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
