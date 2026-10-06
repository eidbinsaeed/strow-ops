"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/owner/LocaleProvider";
import type { PosImportResult } from "@/app/api/pos/import/route";

type Item = {
  key: string;
  name: string;
  file: File;
  state: "waiting" | "uploading" | "done" | "stopped";
  result: PosImportResult | null;
};

const MAX_BYTES = 5 * 1024 * 1024;
const CHIP = "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold";
const TONE = {
  blue: "bg-[#E3EAFB] text-[#1A3FA8]",
  green: "bg-[#E7F6EC] text-[#0A6B34]",
  red: "bg-[#FBE9E7] text-[#9A1B12]",
  amber: "bg-[#FFF4E0] text-[#6E4200]",
  grey: "bg-[#EEF0F3] text-[#3F4A57]",
} as const;

let seq = 0;

function aed(n: number): string {
  return `AED ${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "Tue 6 Oct" / "الثلاثاء 6 أكتوبر" for a YYYY-MM-DD date (built from parts: browsers differ on commas). */
function dayLabel(iso: string, ar: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const parts = new Intl.DateTimeFormat(ar ? "ar-AE-u-nu-latn" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(
    new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])),
  );
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** Checked before sending; the server re-checks everything. */
function precheck(file: File): string | null {
  if (!/\.xlsx$/i.test(file.name)) return "not an .xlsx file";
  if (file.size > MAX_BYTES) return "file is larger than 5 MB (a daily report is much smaller)";
  if (file.size === 0) return "empty file";
  return null;
}

/** The parser's reasons are English; say the common ones in Arabic, keep the details. */
function explain(reason: string, ar: boolean): string {
  if (!ar) return reason;
  const rules: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^report covers (\d+) business days/, (m) => `التقرير يغطي ${m[1]} أيام عمل، ويُستورد فقط تقرير يوم واحد`],
    [/^not an \.xlsx file$/, () => "ليس ملف إكسل (xlsx)"],
    [/^not an EZI POS daily report \(missing sheets: (.*)\)$/, (m) => `ليس تقرير EZI POS يومياً (أوراق ناقصة: ${m[1]})`],
    [/^totals do not reconcile: (.*)$/, (m) => `المجاميع غير متطابقة: ${m[1]}`],
    [/^time period (.*) does not match business date (.*)$/, (m) => `فترة التقرير ${m[1]} لا تطابق يوم العمل ${m[2]}`],
    [/^unreadable generation time/, () => "وقت إنشاء التقرير غير مقروء"],
    [/^sales summary incomplete$/, () => "ملخص المبيعات ناقص"],
    [/^order list columns changed$/, () => "أعمدة قائمة الطلبات تغيّرت"],
    [/^file is larger than 5 MB/, () => "الملف أكبر من 5 ميغابايت"],
    [/^empty file$/, () => "ملف فارغ"],
    [/^unreadable \.xlsx file \((.*)\)$/, (m) => `ملف إكسل غير مقروء (${m[1]})`],
    [/^this report is already imported$/, () => "هذا التقرير مستورد مسبقاً"],
    [/^a newer report for this day is already imported$/, () => "يوجد تقرير أحدث لهذا اليوم"],
  ];
  for (const [re, say] of rules) {
    const m = reason.match(re);
    if (m) return say(m);
  }
  return reason;
}

export function PosUpload() {
  const locale = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const queue = useRef<Item[]>([]);
  const running = useRef(false);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  function add(files: File[]) {
    if (!files.length) return;
    setSignedOut(false);
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const fresh: Item[] = sorted.map((file) => {
      const reason = precheck(file);
      return {
        key: `pos${++seq}`,
        name: file.name,
        file,
        state: reason ? "done" : "waiting",
        result: reason ? { ok: false, file: file.name, reason } : null,
      };
    });
    setItems((list) => [...list, ...fresh]);
    queue.current.push(...fresh.filter((i) => i.state === "waiting"));
    void run();
  }

  async function send(file: File): Promise<PosImportResult | "signed-out"> {
    try {
      const res = await fetch("/api/pos/import", {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      if (res.status === 401) return "signed-out";
      try {
        return (await res.json()) as PosImportResult;
      } catch {
        const reason = res.status === 413 ? "file is larger than 5 MB (a daily report is much smaller)" : `upload failed (HTTP ${res.status})`;
        return { ok: false, file: file.name, reason };
      }
    } catch {
      return { ok: false, file: file.name, reason: ar ? "مشكلة في الاتصال، حاول مرة أخرى" : "connection problem, try again" };
    }
  }

  // One file at a time, in order; files added meanwhile join the queue.
  async function run() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    let sent = 0;
    while (queue.current.length) {
      const item = queue.current.shift()!;
      patch(item.key, { state: "uploading" });
      const result = await send(item.file);
      if (result === "signed-out") {
        const stopped = new Set([item.key, ...queue.current.map((i) => i.key)]);
        queue.current = [];
        setItems((list) => list.map((i) => (stopped.has(i.key) ? { ...i, state: "stopped" } : i)));
        setSignedOut(true);
        break;
      }
      sent += 1;
      patch(item.key, { state: "done", result });
    }
    running.current = false;
    setBusy(false);
    if (sent) router.refresh();
  }

  const finished = items.filter((i) => i.state === "done" && i.result);
  const imported = finished.filter((i) => i.result!.ok && i.result!.status !== "skipped").length;
  const already = finished.filter((i) => i.result!.ok && i.result!.status === "skipped").length;
  const rejected = finished.filter((i) => !i.result!.ok).length;
  const summary = [
    imported ? (ar ? `${imported} تم استيرادها` : `${imported} imported`) : "",
    already ? (ar ? `${already} موجودة مسبقاً` : `${already} already there`) : "",
    rejected ? (ar ? `${rejected} مرفوضة` : `${rejected} rejected`) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const pending = items.filter((i) => i.state === "waiting" || i.state === "uploading").length;

  return (
    <section className="rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{ar ? "رفع تقارير سابقة" : "Upload old reports"}</h2>
        {items.length && !busy ? (
          <button type="button" onClick={() => setItems([])} className="min-h-11 rounded-full px-3 text-sm text-neutral-500 transition active:scale-95">
            {ar ? "مسح القائمة" : "Clear list"}
          </button>
        ) : null}
      </div>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDrag(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(Array.from(e.dataTransfer.files));
        }}
        className={`mt-4 flex min-h-[156px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed px-5 py-6 text-center transition ${
          drag ? "border-strow-blue bg-[#E3EAFB]" : "border-[#D4D9E0] bg-[#F4F5F7] hover:border-[#97A1AE]"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-9 w-9 text-strow-blue" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M12 18v-6" />
          <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
        </svg>
        <span className="text-[15px] font-semibold">{ar ? "اسحب ملفات التقارير وأفلتها هنا" : "Drop report files here"}</span>
        <span className="text-xs text-neutral-500">{ar ? "ملفات xlsx من EZI POS، أي عدد منها معاً" : ".xlsx files from EZI POS, as many as you like"}</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-1 min-h-11 rounded-full bg-strow-ink px-5 text-sm font-semibold text-white transition active:scale-95"
        >
          {ar ? "اختر الملفات" : "Choose files"}
        </button>
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        multiple
        className="hidden"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <p className="mt-2.5 text-xs text-neutral-500">
        {ar
          ? "كل ملف يجب أن يكون تقريراً ليوم عمل واحد. المنتجات الجديدة في التقرير تُضاف إلى الوصفات تلقائياً."
          : "Each file must be a single-day report. New products in a report are added to Recipes automatically."}
      </p>

      {signedOut ? (
        <p className="mt-3 rounded-2xl bg-[#FBE9E7] px-3.5 py-2.5 text-sm text-[#9A1B12]">
          {ar ? "انتهت الجلسة. سجّل الدخول مرة أخرى ثم اختر الملفات التي لم تُرسل." : "You were signed out. Log in again, then choose the files that were not sent."}
        </p>
      ) : null}

      {items.length ? (
        <div className="mt-4">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pb-2 text-sm" role="status" aria-live="polite">
            {busy ? (
              <span className="flex items-center gap-2 text-neutral-600">
                <span className="ai-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="tabular-nums">
                  {ar ? "جارٍ الرفع" : "Uploading"} {items.length - pending + 1}/{items.length}
                </span>
              </span>
            ) : null}
            {summary ? <span className="font-semibold tabular-nums">{summary}</span> : null}
          </p>
          <ul>
            {items.map((i) => (
              <UploadRow key={i.key} item={i} ar={ar} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function UploadRow({ item, ar }: { item: Item; ar: boolean }) {
  const r = item.result;
  const date = r?.ok ? dayLabel(r.date, ar) : null;
  let chip: { tone: keyof typeof TONE; label: string };
  if (item.state === "waiting") chip = { tone: "grey", label: ar ? "بالانتظار" : "Waiting" };
  else if (item.state === "uploading") chip = { tone: "blue", label: ar ? "جارٍ الرفع…" : "Uploading…" };
  else if (item.state === "stopped") chip = { tone: "grey", label: ar ? "لم يُرسل" : "Not sent" };
  else if (!r || !r.ok) chip = { tone: "red", label: ar ? "مرفوض" : "Rejected" };
  else if (r.status === "replaced") chip = { tone: "blue", label: ar ? "استبدل تقريراً أقدم" : "Replaced an older report" };
  else if (r.status === "skipped") chip = { tone: "grey", label: ar ? "مستورد مسبقاً" : "Already imported" };
  else chip = { tone: "green", label: ar ? "تم الاستيراد" : "Imported" };

  return (
    <li className="border-t border-[#EDF0F3] py-3">
      <p className="flex min-w-0 items-baseline gap-1.5 text-[15px]">
        <span className="min-w-0 truncate text-neutral-600" dir="auto">
          {item.name}
        </span>
        {date ? (
          <>
            <span className="shrink-0 text-neutral-400" aria-hidden>
              {ar ? "←" : "→"}
            </span>
            <span className="shrink-0 font-semibold">{date}</span>
          </>
        ) : null}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-neutral-500">
        <span className={`${CHIP} ${TONE[chip.tone]}`}>{chip.label}</span>
        {r?.ok ? (
          <>
            <span className="whitespace-nowrap tabular-nums">
              {r.orders} {ar ? "طلب" : r.orders === 1 ? "order" : "orders"}
              {" · "}
              <span className="font-semibold text-strow-ink">{aed(r.total_paid)}</span>
            </span>
            {r.new_menu_items > 0 ? (
              <Link href={"/owner/recipes" as Route} className="inline-flex min-h-11 items-center font-semibold text-strow-blue">
                {ar ? `${r.new_menu_items} منتج جديد في الوصفات` : `${r.new_menu_items} new ${r.new_menu_items === 1 ? "product" : "products"} in Recipes`}
              </Link>
            ) : null}
            {r.prices_filled > 0 ? (
              <span>{ar ? `${r.prices_filled} سعر أُضيف` : `${r.prices_filled} ${r.prices_filled === 1 ? "price" : "prices"} filled`}</span>
            ) : null}
          </>
        ) : null}
      </div>
      {r && !r.ok ? <p className="mt-1.5 text-[13px] text-[#9A1B12]">{explain(r.reason, ar)}</p> : null}
      {r?.ok && r.status === "skipped" && r.reason ? <p className="mt-1.5 text-[13px] text-neutral-500">{explain(r.reason, ar)}</p> : null}
      {r?.ok && r.warnings.length ? (
        <p className="mt-1.5 text-[13px] text-[#6E4200]">
          {ar ? "ملاحظات" : "Warnings"}: {r.warnings.join("; ")}
        </p>
      ) : null}
    </li>
  );
}
