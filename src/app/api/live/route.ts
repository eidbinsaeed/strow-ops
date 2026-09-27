import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LiveEvent = { key: string; kind: "closing" | "expense" | "ai"; title: string; subtitle: string; href: string };

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
};
const aed = (v: unknown) => `AED ${Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const first = (r: { data: unknown }) => ((r.data as Record<string, unknown>[] | null)?.[0] ?? null);

/**
 * GET /api/live?since=ISO — a cheap "what changed" check for open owner screens:
 *  sig    changes whenever closings, bills, cash or AI items change (screen refreshes)
 *  events new closings / bills / Autopilot findings since `since` (shown as banners)
 */
export async function GET(req: Request) {
  if (!(await getOwnerSession())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const url = new URL(req.url);
  const raw = url.searchParams.get("since");
  const since = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  const now = new Date().toISOString();
  const db = createServiceClient();

  const [cl, ex, open, lastAi, cash] = await Promise.all([
    db.from("closings").select("updated_at", { count: "exact" }).order("updated_at", { ascending: false }).limit(1),
    db.from("expenses").select("updated_at", { count: "exact" }).order("updated_at", { ascending: false }).limit(1),
    db.from("ai_actions").select("id", { count: "exact", head: true }).in("status", ["proposed", "info"]),
    db.from("ai_actions").select("created_at").order("created_at", { ascending: false }).limit(1),
    db.from("cash_events").select("id", { count: "exact", head: true }),
  ]);
  const sig = JSON.stringify([cl.count, first(cl)?.updated_at, ex.count, first(ex)?.updated_at, open.count, first(lastAi)?.created_at, cash.count]);

  const events: LiveEvent[] = [];
  if (since) {
    const [nc, ne, na] = await Promise.all([
      db.from("closings").select("id, closing_date, grand_total, barista_id").gt("created_at", since).neq("status", "rejected").order("created_at").limit(5),
      db.from("expenses").select("id, total, supplier_id, barista_id").gt("created_at", since).order("created_at").limit(5),
      db.from("ai_actions").select("id, title, status").eq("source", "autopilot").in("status", ["proposed", "info"]).gt("created_at", since).order("created_at").limit(3),
    ]);
    type C = { id: string; closing_date: string; grand_total: number | null; barista_id: string | null };
    type B = { id: string; total: number | null; supplier_id: string | null; barista_id: string | null };
    type A = { id: string; title: string; status: string };
    const closings = (nc.data ?? []) as C[];
    const bills = (ne.data ?? []) as B[];
    const ai = (na.data ?? []) as A[];
    const baristaIds = [...new Set([...closings, ...bills].map((r) => r.barista_id).filter((v): v is string => !!v))];
    const supplierIds = [...new Set(bills.map((b) => b.supplier_id).filter((v): v is string => !!v))];
    const [bn, sn] = await Promise.all([
      baristaIds.length ? db.from("baristas").select("id, name").in("id", baristaIds) : Promise.resolve({ data: [] }),
      supplierIds.length ? db.from("suppliers").select("id, name").in("id", supplierIds) : Promise.resolve({ data: [] }),
    ]);
    const bName = new Map(((bn.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
    const sName = new Map(((sn.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
    for (const c of closings) {
      const who = c.barista_id ? bName.get(c.barista_id) : null;
      events.push({ key: `closing:${c.id}`, kind: "closing", title: `New closing${who ? ` from ${who}` : ""}`, subtitle: `${day(c.closing_date)} · ${aed(c.grand_total)}`, href: "/owner/closings" });
    }
    for (const b of bills) {
      const who = b.barista_id ? bName.get(b.barista_id) : null;
      events.push({ key: `expense:${b.id}`, kind: "expense", title: `New bill${who ? ` from ${who}` : ""}`, subtitle: `${(b.supplier_id && sName.get(b.supplier_id)) || "Purchase"} · ${aed(b.total)}`, href: "/owner/expenses" });
    }
    for (const a of ai) {
      events.push({ key: `ai:${a.id}`, kind: "ai", title: a.status === "info" ? "Autopilot alert" : "Autopilot has a fix for you", subtitle: a.title, href: `/owner/needs-you?id=${a.id}` });
    }
  }
  return NextResponse.json({ now, sig, events }, { headers: { "Cache-Control": "no-store" } });
}
