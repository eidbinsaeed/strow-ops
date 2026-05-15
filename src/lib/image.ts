/**
 * Client-side image preprocessing for the barista capture flows.
 *
 * Phone photos are 4-8 MB at full resolution — too large to POST reliably to
 * the extraction API (Vercel rejects request bodies over ~4.5 MB) and slow
 * over café wifi. `compressImage` downscales the photo and re-encodes it as a
 * JPEG, which:
 *   - keeps the upload small (~200-400 KB) and fast
 *   - normalizes the format — iOS HEIC photos get converted to JPEG, so the
 *     extraction route never sees an unsupported media type
 *   - keeps the canvas small enough to dodge iOS Safari's canvas-size limits
 *
 * A 1600px JPEG is still fully legible for OCR and for the owner's archive.
 * Browser-only (uses Image, canvas, URL.createObjectURL).
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export type PreparedImage = {
  dataUrl: string;
  mediaType: "image/jpeg";
};

export async function compressImage(
  file: File,
  maxDimension = MAX_DIMENSION,
  quality = JPEG_QUALITY,
): Promise<PreparedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(
          new Error("Could not read that photo. Please try taking it again."),
        );
      image.src = objectUrl;
    });

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!width || !height) {
      throw new Error("That photo looks empty. Please try taking it again.");
    }

    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(
        "Could not process the photo on this device. Try a different browser.",
      );
    }
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (!dataUrl || !dataUrl.startsWith("data:image/jpeg")) {
      throw new Error(
        "Could not process the photo. Please try taking it again.",
      );
    }
    return { dataUrl, mediaType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
