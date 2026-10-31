import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { getBaristaSession } from "@/lib/auth/session";
import { downloadItemPhoto } from "@/lib/item-photo";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Streams an item's photo from the private bucket, to the owner or signed-in staff (count lists).
// The page adds ?v=<last change>, so the device keeps it cached until the photo changes.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const [owner, barista] = await Promise.all([getOwnerSession(), getBaristaSession()]);
  if (!owner && !barista) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const photo = await downloadItemPhoto(id);
  if (!photo) return NextResponse.json({ error: "No photo" }, { status: 404 });
  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=604800, immutable" },
  });
}
