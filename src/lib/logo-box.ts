/**
 * Where a supplier's logo sits on a bill photo, as fractions of the photo
 * (0–1, x/y = top-left corner). The AI gives the box; the browser cuts it out.
 */
export type LogoBox = { x: number; y: number; w: number; h: number };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A box the AI returned, made safe: inside the photo, not a speck, not most of the page. Else null. */
export function cleanLogoBox(raw: unknown): LogoBox | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isNum(r.x) || !isNum(r.y) || !isNum(r.w) || !isNum(r.h)) return null;
  // Some answers come in percent; bring them back to fractions.
  const scale = Math.max(r.x, r.y, r.w, r.h) > 1.5 ? 100 : 1;
  let x = r.x / scale, y = r.y / scale, w = r.w / scale, h = r.h / scale;
  x = Math.min(Math.max(x, 0), 1);
  y = Math.min(Math.max(y, 0), 1);
  w = Math.min(w, 1 - x);
  h = Math.min(h, 1 - y);
  if (w < 0.03 || h < 0.015) return null; // a speck — not a logo
  if (w * h > 0.35) return null; // a third of the page — the AI boxed the whole bill
  return { x, y, w, h };
}

/** The pixel rectangle to cut, with a little breathing room around the logo. */
export function cropRect(box: LogoBox, width: number, height: number, pad = 0.12): { sx: number; sy: number; sw: number; sh: number } {
  const px = box.w * width * pad + 4;
  const py = box.h * height * pad + 4;
  const sx = Math.max(0, Math.floor(box.x * width - px));
  const sy = Math.max(0, Math.floor(box.y * height - py));
  const ex = Math.min(width, Math.ceil((box.x + box.w) * width + px));
  const ey = Math.min(height, Math.ceil((box.y + box.h) * height + py));
  return { sx, sy, sw: Math.max(1, ex - sx), sh: Math.max(1, ey - sy) };
}
