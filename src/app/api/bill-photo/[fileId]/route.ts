import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { getBaristaSession } from "@/lib/auth/session";
import { downloadDriveFile } from "@/lib/drive/upload";

export const dynamic = "force-dynamic";

// Streams a bill photo from Drive through our server, so viewers never need
// a Google login. Gated to signed-in owner or barista sessions.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const [owner, barista] = await Promise.all([getOwnerSession(), getBaristaSession()]);
  if (!owner && !barista) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const { fileId } = await params;
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const file = await downloadDriveFile(fileId);
  if (!file) {
    return NextResponse.json({ error: "Photo not found in Drive" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      // Bills never change once uploaded — cache privately on the device.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
