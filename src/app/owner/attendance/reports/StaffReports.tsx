"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { tr } from "@/lib/i18n/tr";
import type { Locale } from "@/lib/i18n/dict";
import { addStaffReport, deleteStaffReport } from "./actions";

type Report = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  severity: string | null;
  occurred_on: string;
  acknowledged_at: string | null;
};

const KINDS = ["warning", "incident", "note", "commendation"];

function todayDubai(): string {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function StaffReports({
  staffId,
  staffName,
  cafe,
  reports,
  locale,
}: {
  staffId: string;
  staffName: string;
  cafe: string;
  reports: Report[];
  locale: Locale;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const sel =
    "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none";

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      await addStaffReport(fd);
      form.reset();
      router.refresh();
    });
  }
  function onDelete(id: string) {
    start(async () => {
      await deleteStaffReport(id);
      router.refresh();
    });
  }

  function printLetter(r: Report) {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    const sev = r.severity ? ` (${r.severity})` : "";
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${r.title} — ${staffName}</title></head>` +
        `<body style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#222;padding:48px;max-width:720px">` +
        `<div style="border-bottom:3px solid #5b3a29;padding-bottom:8px;margin-bottom:24px"><span style="font-size:24px;font-weight:700;color:#5b3a29">${cafe}</span></div>` +
        `<div style="text-align:right;color:#666;font-size:13px">${r.occurred_on}</div>` +
        `<h2 style="text-transform:uppercase;letter-spacing:1px">${r.kind === "warning" ? "Warning Letter" : "Incident Report"}${sev}</h2>` +
        `<p><b>To:</b> ${staffName}</p>` +
        `<p><b>Subject:</b> ${r.title}</p>` +
        `<p style="line-height:1.7;white-space:pre-wrap">${(r.detail ?? "").replace(/</g, "&lt;")}</p>` +
        `<p style="margin-top:28px;line-height:1.7">This ${r.kind === "warning" ? "warning" : "report"} is recorded in your employee file in line with Qavè Cafe policy and UAE Federal Decree-Law 33/2021. Continued issues may lead to further disciplinary action.</p>` +
        `<div style="margin-top:60px;display:flex;justify-content:space-between">` +
        `<div>Employee signature<br><br>__________________</div>` +
        `<div>Manager signature<br><br>__________________</div></div>` +
        `</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  const badge: Record<string, string> = {
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    incident: "bg-red-50 text-red-700 border-red-200",
    note: "bg-neutral-100 text-neutral-600 border-neutral-200",
    commendation: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={onAdd}
        className="rounded-2xl border border-neutral-200 bg-white p-4"
      >
        <input type="hidden" name="barista_id" value={staffId} />
        <p className="mb-3 text-sm font-medium">{tr("rep.add", locale)}</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[150px_1fr_130px_140px]">
          <select name="kind" defaultValue="warning" className={sel}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {tr("rep.k." + k, locale)}
              </option>
            ))}
          </select>
          <input name="title" required placeholder={tr("rep.titlefield", locale)} className={sel} />
          <select name="severity" defaultValue="" className={sel}>
            <option value="">{tr("rep.severity", locale)}</option>
            <option value="low">{tr("rep.sev.low", locale)}</option>
            <option value="medium">{tr("rep.sev.medium", locale)}</option>
            <option value="high">{tr("rep.sev.high", locale)}</option>
          </select>
          <input type="date" name="occurred_on" defaultValue={todayDubai()} className={sel} />
        </div>
        <textarea
          name="detail"
          rows={2}
          placeholder={tr("rep.detail", locale)}
          className={sel + " mt-2 w-full"}
        />
        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-lg bg-strow-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {tr("rep.save", locale)}
        </button>
      </form>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
          {tr("rep.none", locale)}
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span
                    className={
                      "inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium " +
                      (badge[r.kind] ?? badge.note)
                    }
                  >
                    {tr("rep.k." + r.kind, locale)}
                    {r.severity ? " · " + tr("rep.sev." + r.severity, locale) : ""}
                  </span>
                  <div className="mt-1 font-medium">{r.title}</div>
                  {r.detail && (
                    <div className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-600">
                      {r.detail}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-neutral-400">{r.occurred_on}</div>
                  {(r.kind === "warning" || r.kind === "incident") &&
                    (r.acknowledged_at ? (
                      <div className="mt-1 text-xs font-medium text-emerald-700">
                        ✓ {tr("rep.ack.done", locale)} · {r.acknowledged_at.slice(0, 10)}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-amber-600">
                        ⏳ {tr("rep.ack.pending", locale)}
                      </div>
                    ))}
                </div>
                <div className="flex flex-shrink-0 flex-col gap-1">
                  {(r.kind === "warning" || r.kind === "incident") && (
                    <button
                      onClick={() => printLetter(r)}
                      className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                    >
                      {tr("rep.print", locale)}
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(r.id)}
                    disabled={pending}
                    className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {tr("rep.delete", locale)}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
