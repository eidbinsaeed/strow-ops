"use client";

/**
 * Cuts a supplier's logo out of a bill photo in the browser and returns a
 * small JPEG (at most 320 px on its long side) on white, ready to save.
 */
import { cropRect, type LogoBox } from "./logo-box";

const MAX = 320;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't open the photo"));
    img.src = src;
  });
}

function draw(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): string | null {
  const k = Math.min(1, MAX / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.9);
}

/** The logo from a bill photo (a data URL or a same-site photo link). Null if it can't be cut. */
export async function cropLogo(src: string, box: LogoBox): Promise<string | null> {
  try {
    const img = await load(src);
    const r = cropRect(box, img.naturalWidth, img.naturalHeight);
    return draw(img, r.sx, r.sy, r.sw, r.sh);
  } catch {
    return null;
  }
}

/** A logo picked by hand (any image file), shrunk to the same small size. */
export async function shrinkLogoFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await load(url);
    return draw(img, 0, 0, img.naturalWidth, img.naturalHeight);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
