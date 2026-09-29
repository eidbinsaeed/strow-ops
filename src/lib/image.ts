/**
 * Client-side image preprocessing for the barista capture flows.
 *
 * Phone photos are 4-8 MB at full resolution — too large to POST reliably to
 * the extraction API (Vercel rejects request bodies over ~4.5 MB) and slow
 * over café wifi. `compressImage` downscales the photo and re-encodes it as a
 * JPEG (HEIC becomes JPEG too).
 *
 * iPhones can fail to decode a big photo when memory is tight, and the canvas
 * then silently stays empty — which used to come out as an all-black JPEG the
 * AI could not read. Every attempt is now checked: a blank result is retried
 * a different way (decode-at-size, then smaller), and if it is still blank the
 * barista is asked to retake the photo instead of sending a black image.
 * Browser-only (uses Image, canvas, URL.createObjectURL).
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export type PreparedImage = {
  dataUrl: string;
  mediaType: "image/jpeg";
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that photo. Please try taking it again."));
    image.src = url;
  });
}

function fit(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { w, h };
  const s = max / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Draw on a white canvas, encode as JPEG, and report whether the result is blank. */
function render(source: CanvasImageSource, w: number, h: number, quality: number): { dataUrl: string; blank: boolean } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the photo on this device. Try a different browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);

  let blank = false;
  try {
    const probe = document.createElement("canvas");
    probe.width = 24;
    probe.height = 24;
    const p = probe.getContext("2d");
    if (p) {
      p.drawImage(canvas, 0, 0, 24, 24);
      const d = p.getImageData(0, 0, 24, 24).data;
      let min = 255;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (l < min) min = l;
        if (l > max) max = l;
      }
      blank = max - min < 4;
    }
  } catch {
    /* can't inspect pixels — assume the photo is fine */
  }
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  canvas.width = 0;
  canvas.height = 0;
  return { dataUrl, blank };
}

export async function compressImage(file: File, maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY): Promise<PreparedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    try {
      await img.decode();
    } catch {
      /* decode() is only a hint */
    }
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error("That photo looks empty. Please try taking it again.");

    const attempts: Array<() => Promise<{ dataUrl: string; blank: boolean }>> = [
      async () => {
        const { w, h } = fit(w0, h0, maxDimension);
        return render(img, w, h, quality);
      },
      async () => {
        // Decode straight to the target size — far less memory than a full-size decode.
        if (typeof createImageBitmap !== "function") throw new Error("unsupported");
        const { w, h } = fit(w0, h0, maxDimension);
        const bmp = await createImageBitmap(file, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
        try {
          return render(bmp, w, h, quality);
        } finally {
          bmp.close();
        }
      },
      async () => {
        const { w, h } = fit(w0, h0, 1024);
        return render(img, w, h, quality);
      },
    ];

    for (const attempt of attempts) {
      try {
        const out = await attempt();
        if (!out.blank && out.dataUrl.startsWith("data:image/jpeg")) return { dataUrl: out.dataUrl, mediaType: "image/jpeg" };
      } catch {
        /* try the next way */
      }
    }
    throw new Error("The photo came out blank. Please take it again — hold the phone steady and make sure the screen or sheet is lit.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ─── Bills: photo OR digital file ──────────────────────────────────────────
//
// Suppliers sometimes send the invoice digitally (PDF by email/WhatsApp, or a
// screenshot). Images go through compressImage as before; PDFs are sent as-is
// because Claude reads PDFs natively (every page, real text — no OCR loss).
//
// Size cap: the PDF travels base64-encoded (+33%) to the extract API and again
// in the submit action, and Vercel rejects request bodies over ~4.5 MB. 3 MB
// raw keeps us safely under that. Supplier invoice PDFs are usually < 500 KB.

export const MAX_PDF_BYTES = 3 * 1024 * 1024;

export type PreparedBill = {
  dataUrl: string;
  mediaType: "image/jpeg" | "application/pdf";
  fileName: string | null;
};

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read that file. Please try again."));
    r.readAsDataURL(file);
  });
}

export async function prepareBillFile(file: File): Promise<PreparedBill> {
  if (isPdfFile(file)) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(
        `That PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 3 MB. Take a screenshot of the invoice and upload that instead.`,
      );
    }
    const raw = await readAsDataUrl(file);
    // Some phones report an empty/odd MIME type — normalise the data-URL header.
    const comma = raw.indexOf(",");
    const dataUrl = `data:application/pdf;base64,${raw.slice(comma + 1)}`;
    return { dataUrl, mediaType: "application/pdf", fileName: file.name || "invoice.pdf" };
  }
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Please upload a photo, screenshot, or PDF of the bill.");
  }
  const img = await compressImage(file);
  return { ...img, fileName: null };
}
