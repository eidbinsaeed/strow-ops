import { NextResponse } from "next/server";
import { submitExpense } from "@/app/(barista)/expense/actions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_form_data" }, { status: 400 });
  }

  try {
    const result = await submitExpense(formData);
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
    console.error("[queue/replay-expense] error:", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
