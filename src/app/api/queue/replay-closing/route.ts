import { NextResponse } from "next/server";
import { submitClosing } from "@/app/(barista)/close/actions";

export const runtime = "nodejs";

/**
 * Replay endpoint for queued offline closing submissions.
 *
 * The barista session cookie still has to be present and valid - replays
 * happen on the same device/browser the submission was queued on.
 *
 * submitClosing() throws a NEXT_REDIRECT on success (because of the
 * `redirect("/today?...")` call). We catch that and return 200, since the
 * offline replay client doesn't actually want to be redirected.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_form_data" }, { status: 400 });
  }

  try {
    const result = await submitClosing(formData);
    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "digest" in e &&
      typeof (e as { digest?: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      return NextResponse.json({ ok: true });
    }
    // eslint-disable-next-line no-console
    console.error("[queue/replay-closing] error:", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
