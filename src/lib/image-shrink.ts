"use client";

/**
 * Shrinks a picture (a data URL from the web finder, or a file the owner picked) to a small
 * JPEG on white — at most 360 px on its long side — ready to save as an item photo or logo.
 * SVG logos with no size of their own are drawn at 360 px.
 */
const MAX = 360;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't open the picture"));
    img.src = src;
  });
}

function draw(img: HTMLImageElement, vector = false): string | null {
  const nw = img.naturalWidth || MAX;
  const nh = img.naturalHeight || MAX;
  // Photos are never blown up; a vector logo is drawn at full size.
  const k = vector ? MAX / Math.max(nw, nh) : Math.min(1, MAX / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * k));
  const h = Math.max(1, Math.round(nh * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  for (const q of [0.88, 0.8, 0.7]) {
    const out = c.toDataURL("image/jpeg", q);
    if (out.length < 500_000) return out;
  }
  return null;
}

export async function shrinkPicture(src: string): Promise<string | null> {
  try {
    return draw(await load(src), src.startsWith("data:image/svg+xml"));
  } catch {
    return null;
  }
}

export async function shrinkPictureFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    return draw(await load(url));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
