import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { reviseAction, type ReviseEvent } from "@/lib/ai/revise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ ok: false, error: "Sign in again" }, { status: 401 });
  let body: { id?: unknown; note?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const id = String(body.id ?? "");
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  const note = String(body.note ?? "").slice(0, 2000);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ReviseEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* the phone went away; the work still finishes and shows on the next visit */
        }
      };
      try {
        const res = await reviseAction(id, note, send);
        send({ t: "result", ...res });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const friendly = /credit balance|billing|quota|insufficient/i.test(msg)
          ? "The AI account is out of credit — top up the Anthropic API balance and try again."
          : /overloaded|529|rate/i.test(msg)
            ? "The AI is busy right now — try again in a minute."
            : "Something went wrong: " + msg.slice(0, 200);
        send({ t: "result", ok: false, status: "unchanged", message: friendly });
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}
