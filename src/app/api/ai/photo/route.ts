import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";
import { downloadDriveFile } from "@/lib/drive/upload";
import { driveFileId } from "@/lib/ai/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Streams the photo of a bill (expenses) or closing (closings) for the owner.
export async function GET(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const url = new URL(req.url);
  const table = url.searchParams.get("table") === "closings" ? "closings" : "expenses";
  const id = url.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const db = createServiceClient();
  const { data } = await db.from(table).select("photo_drive_url").eq("id", id).maybeSingle();
  const fileId = driveFileId((data as { photo_drive_url?: string | null } | null)?.photo_drive_url);
  if (!fileId) return NextResponse.json({ error: "No photo" }, { status: 404 });
  const file = await downloadDriveFile(fileId);
  if (!file) return NextResponse.json({ error: "Photo not found in Drive" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: { "Content-Type": file.mimeType, "Cache-Control": "private, max-age=86400, immutable" },
  });
}
