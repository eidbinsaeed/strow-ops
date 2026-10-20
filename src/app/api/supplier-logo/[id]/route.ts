import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { getBaristaSession } from "@/lib/auth/session";
import { downloadSupplierLogo } from "@/lib/supplier-logo";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Streams a supplier's logo from the private bucket. The page adds ?v=<last change>,
// so the device can keep it cached until the logo changes.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const [owner, barista] = await Promise.all([getOwnerSession(), getBaristaSession()]);
  if (!owner && !barista) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const logo = await downloadSupplierLogo(id);
  if (!logo) return NextResponse.json({ error: "No logo" }, { status: 404 });
  return new NextResponse(new Uint8Array(logo.bytes), {
    headers: { "Content-Type": logo.contentType, "Cache-Control": "private, max-age=604800, immutable" },
  });
}
