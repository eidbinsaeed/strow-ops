"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { tr } from "@/lib/i18n/tr";
import type { Locale } from "@/lib/i18n/dict";
import { setDayStatus, addRecord } from "./actions";

type Item = { baristaId: string; name: string; role: string; date: string; status: string };
type Staff = { id: string; name: string; role: string };

const ROW_OPTS = ["present", "late", "absent", "sick", "off"];
const ADD_OPTS = ["sick", "off", "absent", "late"];

function todayDubai(): string {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function AttendanceLogEditor({
  items,
  staff,
  locale,
}: {
  items: Item[];
  staff: Staff[];
  locale: Locale;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const label = (s: string) => tr("att.st." + s, locale);

  function change(baristaId: string, date: string, status: string) {
    start(async () => {
      await setDayStatus(baristaId, date, status);
      router.refresh();
    });
  }

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      await addRecord(fd);
      form.reset();
      router.refresh();
    });
  }

  const sel =
    "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none";

  return (
    <div className="space-y-5">
      <form
        onSubmit={onAdd}
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-neutral-200 bg-white p-4"
      >
        <p className="w-full text-sm font-medium">{tr("att.add.title", locale)}</p>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-neutral-400">
            {tr("att.col.staff", locale)}
          </label>
          <select name="barista_id" required defaultValue="" className={sel}>
            <option value="" disabled>
              —
            </option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.role})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-neutral-400">
            {tr("att.col.date", locale)}
          </label>
          <input type="date" name="date" defaultValue={todayDubai()} className={sel} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-neutral-400">
            {tr("att.col.status", locale)}
          </label>
          <select name="status" defaultValue="sick" className={sel}>
            {ADD_OPTS.map((o) => (
              <option key={o} value={o}>
                {label(o)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {tr("att.add.add", locale)}
        </button>
      </form>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
          {tr("att.log.empty", locale)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">{tr("att.col.date", locale)}</th>
                <th className="px-5 py-3 font-medium">{tr("att.col.staff", locale)}</th>
                <th className="px-5 py-3 font-medium">{tr("att.col.status", locale)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((it, i) => (
                <tr key={i} className="text-sm">
                  <td className="px-5 py-3 tabular-nums text-neutral-600">{it.date}</td>
                  <td className="px-5 py-3">
                    <span className="font-medium">{it.name}</span>{" "}
                    <span className="text-xs capitalize text-neutral-500">{it.role}</span>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={it.status}
                      disabled={pending}
                      onChange={(e) => change(it.baristaId, it.date, e.target.value)}
                      className={sel}
                    >
                      {ROW_OPTS.map((o) => (
                        <option key={o} value={o}>
                          {label(o)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
