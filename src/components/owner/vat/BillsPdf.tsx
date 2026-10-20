"use client";

/**
 * Every bill of the period in ONE PDF, ready to send or print. Built in the
 * browser (no size or time limit on the server): page 1 is the list of bills
 * with totals and the page each one is on, then one bill per page with its
 * date, supplier, invoice number and amounts on top. PDF bills keep their own
 * pages. Bills without a photo are in the list, marked "no photo".
 */
import { useState } from "react";
import type { PDFDocument as PDFDoc, PDFFont, PDFPage } from "pdf-lib";

export type PdfBill = {
  id: string;
  date: string;
  supplier: string | null;
  trn: string | null;
  invoice: string | null;
  subtotal: number;
  vat: number;
  total: number;
  photoId: string | null;
};

const A4: [number, number] = [595.28, 841.89];
const M = 32;
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// The built-in PDF font only knows Latin letters; anything else becomes "?".
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, "?");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

type Got = { kind: "jpg" | "png"; bytes: Uint8Array } | { kind: "pdf"; bytes: Uint8Array } | null;

async function toJpeg(blob: Blob): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")?.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.88));
    return out ? new Uint8Array(await out.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function fetchBill(photoId: string): Promise<Got> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`/api/bill-photo/${photoId}`);
      if (!r.ok) continue;
      const blob = await r.blob();
      const b = new Uint8Array(await blob.arrayBuffer());
      if (b[0] === 0xff && b[1] === 0xd8) return { kind: "jpg", bytes: b };
      if (b[0] === 0x89 && b[1] === 0x50) return { kind: "png", bytes: b };
      if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return { kind: "pdf", bytes: b };
      const j = await toJpeg(blob); // webp, heic (Safari), gif…
      return j ? { kind: "jpg", bytes: j } : null;
    } catch {
      /* try once more */
    }
  }
  return null;
}

function text(page: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, grey = false, maxW?: number) {
  let t = safe(s);
  if (maxW) while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + "…";
  page.drawText(t, { x, y, size, font, color: grey ? GREY : INK });
}
let INK: ReturnType<typeof import("pdf-lib").rgb>;
let GREY: ReturnType<typeof import("pdf-lib").rgb>;

export function BillsPdf({ bills, title, fileName, ar }: { bills: PdfBill[]; title: string; fileName: string; ar: boolean }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [result, setResult] = useState<{ url: string; file: File; missing: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const withPhoto = bills.filter((b) => b.photoId);

  const build = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const lib = await import("pdf-lib");
      INK = lib.rgb(0.11, 0.11, 0.12);
      GREY = lib.rgb(0.42, 0.42, 0.44);
      const doc: PDFDoc = await lib.PDFDocument.create();
      doc.setTitle(safe(title));
      doc.setCreator("Strow Ops");
      const font = await doc.embedFont(lib.StandardFonts.Helvetica);
      const boldF = await doc.embedFont(lib.StandardFonts.HelveticaBold);

      // 1) Fetch the bills, four at a time.
      setProgress({ done: 0, of: withPhoto.length });
      const got = new Map<string, Got>();
      let done = 0;
      const queue = [...withPhoto];
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          for (let b = queue.shift(); b; b = queue.shift()) {
            got.set(b.id, await fetchBill(b.photoId as string));
            setProgress({ done: ++done, of: withPhoto.length });
          }
        }),
      );

      // 2) One page per bill (PDF bills keep all their pages). Remember where each starts.
      const FIRST = 44;
      const NEXT = 50;
      const listPages = bills.length <= FIRST ? 1 : 1 + Math.ceil((bills.length - FIRST) / NEXT);
      const startsAt = new Map<string, number>();
      let missing = 0;
      for (const [bi, b] of bills.entries()) {
        const g = b.photoId ? got.get(b.id) : null;
        if (!g) {
          if (b.photoId) missing++;
          continue;
        }
        const head = `${day(b.date)} · ${b.supplier ?? "No supplier"}`;
        const sub = [b.invoice ? `Invoice ${b.invoice}` : null, b.trn ? `TRN ${b.trn}` : null, `Total AED ${money(b.total)}`, `VAT AED ${money(b.vat)}`, `Bill ${bi + 1} of ${bills.length}`].filter(Boolean).join("  ·  ");
        startsAt.set(b.id, listPages + doc.getPageCount() + 1);
        // Every bill page is A4 with the bill's details on top; the photo or the
        // supplier's own PDF page is scaled to fit underneath.
        const boxW = A4[0] - 2 * M;
        const boxH = A4[1] - 2 * M - 46;
        const header = (page: PDFPage, extra = "") => {
          text(page, head, M, A4[1] - M - 12, 13, boldF, false, A4[0] - 2 * M);
          text(page, sub + extra, M, A4[1] - M - 30, 9.5, font, true, A4[0] - 2 * M);
        };
        if (g.kind === "pdf") {
          try {
            const src = await lib.PDFDocument.load(g.bytes, { ignoreEncryption: true });
            const embedded = await doc.embedPdf(src, src.getPageIndices());
            embedded.forEach((ep, i) => {
              const page = doc.addPage(A4);
              header(page, embedded.length > 1 ? `  ·  page ${i + 1} of ${embedded.length}` : "");
              const sc = Math.min(boxW / ep.width, boxH / ep.height);
              page.drawPage(ep, { x: (A4[0] - ep.width * sc) / 2, y: M + (boxH - ep.height * sc) / 2, width: ep.width * sc, height: ep.height * sc });
            });
          } catch {
            // A PDF that can't be embedded: copy its pages as they are.
            try {
              const src = await lib.PDFDocument.load(g.bytes, { ignoreEncryption: true });
              for (const cp of await doc.copyPages(src, src.getPageIndices())) doc.addPage(cp);
            } catch {
              startsAt.delete(b.id);
              missing++;
            }
          }
          continue;
        }
        const img = g.kind === "jpg" ? await doc.embedJpg(g.bytes) : await doc.embedPng(g.bytes);
        const page = doc.addPage(A4);
        header(page);
        const s = Math.min(boxW / img.width, boxH / img.height);
        const w = img.width * s;
        const h = img.height * s;
        page.drawImage(img, { x: (A4[0] - w) / 2, y: M + (boxH - h) / 2, width: w, height: h });
      }

      // 3) The list of bills in front.
      const rows = bills;
      const cols = [
        { t: "#", x: M, w: 20 },
        { t: "Date", x: M + 20, w: 62 },
        { t: "Supplier", x: M + 82, w: 180 },
        { t: "Invoice", x: M + 266, w: 70 },
        { t: "Excl. VAT", x: M + 340, w: 58, r: true },
        { t: "VAT", x: M + 400, w: 46, r: true },
        { t: "Total", x: M + 448, w: 56, r: true },
        { t: "Page", x: M + 506, w: 25, r: true },
      ];
      const cell = (p: PDFPage, s: string, c: (typeof cols)[number], y: number, f: PDFFont, grey = false) => {
        const t = safe(s);
        const size = 8.5;
        let v = t;
        while (v.length > 1 && f.widthOfTextAtSize(v, size) > c.w - 4) v = v.slice(0, -2) + "…";
        const x = c.r ? c.x + c.w - f.widthOfTextAtSize(v, size) - 2 : c.x;
        p.drawText(v, { x, y, size, font: f, color: grey ? GREY : INK });
      };
      let idx = 0;
      for (let pi = 0; pi < listPages; pi++) {
        const p = doc.insertPage(pi, A4);
        let y = A4[1] - M - 14;
        if (pi === 0) {
          text(p, title, M, y, 16, boldF);
          y -= 18;
          const sum = (k: "subtotal" | "vat" | "total") => bills.reduce((a, b) => a + b[k], 0);
          text(p, `${bills.length} bills  ·  Excl. VAT AED ${money(sum("subtotal"))}  ·  VAT AED ${money(sum("vat"))}  ·  Total AED ${money(sum("total"))}`, M, y, 9.5, font, true);
          y -= 14;
          const noPhoto = bills.filter((b) => !startsAt.has(b.id)).length;
          if (noPhoto) {
            text(p, `${noPhoto} of them have no photo in Strow (page "–").`, M, y, 9.5, font, true);
            y -= 14;
          }
          y -= 10;
        }
        cols.forEach((c) => cell(p, c.t, c, y, boldF, true));
        y -= 6;
        p.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: GREY });
        y -= 13;
        const stop = Math.min(rows.length, idx + (pi === 0 ? FIRST : NEXT));
        while (idx < stop) {
          const b = rows[idx];
          const at = startsAt.get(b.id);
          cell(p, String(idx + 1), cols[0], y, font, true);
          cell(p, day(b.date), cols[1], y, font);
          cell(p, b.supplier ?? "No supplier", cols[2], y, font);
          cell(p, b.invoice ?? "", cols[3], y, font, true);
          cell(p, money(b.subtotal), cols[4], y, font);
          cell(p, money(b.vat), cols[5], y, font);
          cell(p, money(b.total), cols[6], y, font);
          cell(p, at ? String(at) : "–", cols[7], y, font, !at);
          y -= 14;
          idx++;
        }
      }

      const bytes = await doc.save();
      const file = new File([bytes as BlobPart], fileName, { type: "application/pdf" });
      const url = URL.createObjectURL(file);
      setResult({ url, file, missing });
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const share = async () => {
    if (!result) return;
    try {
      await navigator.share({ files: [result.file], title });
    } catch {
      /* cancelled */
    }
  };
  const canShare = typeof navigator !== "undefined" && !!result && !!navigator.canShare?.({ files: [result.file] });

  return (
    <div className="flex flex-col">
      <button type="button" onClick={build} disabled={busy} className="apple-row flex w-full items-center gap-3 ps-4 text-start text-strow-ink active:bg-neutral-100 disabled:opacity-70">
        <span aria-hidden className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-[#C55300] text-white">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 3h7l4 4v14H7z M14 3v4h4 M12 11v6 M9.5 14.5 12 17l2.5-2.5" />
          </svg>
        </span>
        <span className="apple-row-body flex min-h-[60px] min-w-0 flex-1 items-center gap-2 py-2 pe-3.5">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[17px] leading-[22px]">{ar ? "كل الفواتير في ملف PDF واحد" : "All bills in one PDF"}</span>
            <span className="text-[15px] leading-5 text-neutral-500">
              {progress
                ? ar
                  ? `أجمع الفواتير ${progress.done} من ${progress.of}…`
                  : `Collecting bills ${progress.done} of ${progress.of}…`
                : ar
                  ? `${bills.length} فاتورة · ${withPhoto.length} بصورة · ملف PDF واحد`
                  : `${bills.length} bills · ${withPhoto.length} with a photo · one PDF`}
            </span>
          </span>
          {busy ? <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-[#C55300] border-t-transparent" /> : null}
        </span>
      </button>
      {progress ? (
        <div className="mx-4 mb-3 h-1.5 overflow-hidden rounded-full bg-[#E5E5EA]">
          <div className="h-full rounded-full bg-[#C55300] transition-[width] duration-300" style={{ width: `${progress.of ? (progress.done / progress.of) * 100 : 0}%` }} />
        </div>
      ) : null}
      {result ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-[15px]">
          <a href={result.url} download={fileName} className="rounded-full bg-[#E8F0FE] px-3.5 py-2 font-semibold text-[#1650C4]">
            {ar ? "حفظ الملف" : "Save the PDF"}
          </a>
          {canShare ? (
            <button type="button" onClick={share} className="rounded-full bg-[#E8F0FE] px-3.5 py-2 font-semibold text-[#1650C4]">
              {ar ? "إرسال" : "Send…"}
            </button>
          ) : null}
          {result.missing ? <span className="text-[13px] text-strow-amber">{ar ? `${result.missing} صور لم تُحمّل` : `${result.missing} photo${result.missing === 1 ? "" : "s"} couldn't be loaded`}</span> : null}
        </div>
      ) : null}
      {err ? <p className="px-4 pb-3 text-[13px] text-strow-amber">{err}</p> : null}
    </div>
  );
}
