/**
 * Google Drive photo upload service.
 *
 * Uploads a base64 JPEG (the same in-memory dataURL we send to Anthropic for
 * extraction) into the user's Drive at:
 *
 *   /Strow/<LocationSlug>/<YYYY-MM>/<closings|expenses>/<entityId>.jpg
 *
 * Returns the Drive file id + display path + viewable URL.
 *
 * Folder lookups/creates are cached in-process per request to keep the
 * upload fast even when the per-month folder doesn't exist yet.
 *
 * Configuration (env):
 *   GOOGLE_DRIVE_CLIENT_ID
 *   GOOGLE_DRIVE_CLIENT_SECRET
 *   GOOGLE_DRIVE_REFRESH_TOKEN
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID  (Drive folder id of /Strow)
 *
 * If any of these are missing, isDriveConfigured() returns false and
 * uploadReceiptPhoto() returns null - callers should treat Drive sync as
 * best-effort and proceed to save the row with a null drive_id.
 */
import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";

export type DriveUploadResult = {
  fileId: string;
  displayPath: string;
  viewUrl: string;
};

export function isDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
      process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN &&
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
  );
}

function getDriveClient(): drive_v3.Drive {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  });
  return google.drive({ version: "v3", auth: oauth2 });
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<string> {
  const safeName = name.replace(/'/g, "\\'");
  const list = await drive.files.list({
    q: `name = '${safeName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 1,
  });
  const existing = list.data.files?.[0]?.id;
  if (existing) return existing;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Failed to create Drive folder");
  return created.data.id;
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Buffer.from(base64, "base64");
}

export type UploadParams = {
  imageDataUrl: string;
  mediaType: string; // e.g. "image/jpeg"
  locationSlug: string; // e.g. "qave_main"
  kind: "closings" | "expenses";
  date: string; // YYYY-MM-DD - used to derive YYYY-MM folder
  entityId: string; // closing or expense uuid - used for filename
};

/**
 * Upload a receipt photo. Returns the Drive metadata, or null on any failure
 * (logged server-side). Never throws so the calling submission can still save.
 */
export async function uploadReceiptPhoto(
  params: UploadParams,
): Promise<DriveUploadResult | null> {
  if (!isDriveConfigured()) return null;

  try {
    const drive = getDriveClient();
    const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;

    const yyyyMm = params.date.slice(0, 7); // "YYYY-MM"

    const locationFolder = await findOrCreateFolder(
      drive,
      params.locationSlug,
      root,
    );
    const monthFolder = await findOrCreateFolder(
      drive,
      yyyyMm,
      locationFolder,
    );
    const kindFolder = await findOrCreateFolder(
      drive,
      params.kind,
      monthFolder,
    );

    const buf = dataUrlToBuffer(params.imageDataUrl);
    const filename = `${params.entityId}.jpg`;

    const created = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [kindFolder],
      },
      media: {
        mimeType: params.mediaType || "image/jpeg",
        body: Readable.from(buf),
      },
      fields: "id",
    });

    const fileId = created.data.id;
    if (!fileId) return null;

    const displayPath = `/Strow/${params.locationSlug}/${yyyyMm}/${params.kind}/${filename}`;
    const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
    return { fileId, displayPath, viewUrl };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[drive] upload failed:", e);
    return null;
  }
}
