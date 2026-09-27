/**
 * Lock-screen notifications (Web Push) for the owner's phone.
 *
 * Keys and subscribed devices live in a private Supabase Storage bucket, so
 * there is nothing to configure and no secret in the (public) repo:
 *   strow-system/push/vapid.json        VAPID key pair, generated on first use
 *   strow-system/push/subs/<hash>.json  one file per subscribed phone/browser
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars override the stored keys.
 * Every function here is best-effort: it logs and never throws.
 */
import { createHash } from "node:crypto";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "strow-system";
const SUB_DIR = "push/subs";

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushMessage = { title: string; body: string; url: string; tag?: string };

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { error } = await createServiceClient().storage.createBucket(BUCKET, { public: false });
  if (error && !/exist/i.test(error.message)) throw new Error(`Storage: ${error.message}`);
  bucketReady = true;
}

async function readJson<T>(path: string): Promise<T | null> {
  const { data, error } = await createServiceClient().storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown) {
  await ensureBucket();
  const { error } = await createServiceClient()
    .storage.from(BUCKET)
    .upload(path, Buffer.from(JSON.stringify(value)), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Storage: ${error.message}`);
}

const subPath = (endpoint: string) => `${SUB_DIR}/${createHash("sha256").update(endpoint).digest("hex").slice(0, 40)}.json`;

let vapid: { publicKey: string; privateKey: string } | null = null;
export async function getVapid(): Promise<{ publicKey: string; privateKey: string }> {
  if (vapid) return vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return (vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  }
  const stored = await readJson<{ publicKey: string; privateKey: string }>("push/vapid.json");
  if (stored?.publicKey && stored.privateKey) return (vapid = stored);
  const keys = webpush.generateVAPIDKeys();
  await writeJson("push/vapid.json", keys);
  const again = await readJson<{ publicKey: string; privateKey: string }>("push/vapid.json");
  return (vapid = again?.publicKey ? again : keys);
}

export async function addSubscription(sub: PushSub, ua?: string | null) {
  await writeJson(subPath(sub.endpoint), { endpoint: sub.endpoint, keys: sub.keys, ua: ua?.slice(0, 200) ?? null, at: new Date().toISOString() });
}

export async function removeSubscription(endpoint: string) {
  await createServiceClient().storage.from(BUCKET).remove([subPath(endpoint)]);
}

async function listSubscriptions(): Promise<PushSub[]> {
  const { data, error } = await createServiceClient().storage.from(BUCKET).list(SUB_DIR, { limit: 100 });
  if (error || !data) return [];
  const subs = await Promise.all(data.filter((f) => f.name.endsWith(".json")).map((f) => readJson<PushSub>(`${SUB_DIR}/${f.name}`)));
  return subs.filter((s): s is PushSub => !!s?.endpoint && !!s.keys?.p256dh && !!s.keys?.auth);
}

export async function sendPush(msg: PushMessage): Promise<{ sent: number; failed: number }> {
  try {
    const subs = await listSubscriptions();
    if (!subs.length) return { sent: 0, failed: 0 };
    const { publicKey, privateKey } = await getVapid();
    webpush.setVapidDetails("https://strow.app", publicKey, privateKey);
    const payload = JSON.stringify(msg);
    let sent = 0;
    let failed = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 43_200, urgency: "high" });
          sent++;
        } catch (e) {
          failed++;
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await removeSubscription(s.endpoint).catch(() => {});
          else console.warn("[push] send failed", code, e instanceof Error ? e.message : e);
        }
      }),
    );
    return { sent, failed };
  } catch (e) {
    console.warn("[push]", e instanceof Error ? e.message : e);
    return { sent: 0, failed: 0 };
  }
}

// ---------- What the owner gets told ----------
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(iso) : `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
};
const money = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

async function baristaName(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const { data } = await createServiceClient().from("baristas").select("name").eq("id", id).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}

export async function notifyNewClosing(id: string) {
  try {
    const { data } = await createServiceClient().from("closings").select("closing_date, grand_total, status, barista_id").eq("id", id).maybeSingle();
    const c = data as { closing_date: string; grand_total: number | null; status: string; barista_id: string | null } | null;
    if (!c) return;
    const who = await baristaName(c.barista_id);
    await sendPush({
      title: `New closing · ${day(c.closing_date)}`,
      body: `AED ${money(c.grand_total)}${who ? ` from ${who}` : ""}${c.status === "flagged" ? " · flagged — tap to check" : c.status === "pending_review" ? " · waiting for your approval" : ""}`,
      url: c.status === "confirmed" ? "/owner/closings" : "/owner/review",
      tag: `closing-${id}`,
    });
  } catch (e) {
    console.warn("[push] closing", e instanceof Error ? e.message : e);
  }
}

export async function notifyNewExpense(id: string) {
  try {
    const db = createServiceClient();
    const { data } = await db.from("expenses").select("total, status, supplier_id, barista_id").eq("id", id).maybeSingle();
    const b = data as { total: number | null; status: string; supplier_id: string | null; barista_id: string | null } | null;
    if (!b) return;
    const [who, sup] = await Promise.all([
      baristaName(b.barista_id),
      b.supplier_id ? db.from("suppliers").select("name").eq("id", b.supplier_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const supplier = (sup.data as { name?: string } | null)?.name;
    await sendPush({
      title: `New bill${supplier ? ` · ${supplier}` : ""}`,
      body: `AED ${money(b.total)}${who ? ` from ${who}` : ""}${b.status === "flagged" ? " · flagged — tap to check" : b.status === "pending_review" ? " · waiting for your approval" : ""}`,
      url: b.status === "confirmed" ? "/owner/expenses" : "/owner/review",
      tag: `expense-${id}`,
    });
  } catch (e) {
    console.warn("[push] bill", e instanceof Error ? e.message : e);
  }
}

export async function notifyAutopilot(runId: string) {
  try {
    const { data } = await createServiceClient().from("ai_actions").select("id, title").eq("run_id", runId).in("status", ["proposed", "info"]).order("created_at");
    const found = (data ?? []) as { id: string; title: string }[];
    if (!found.length) return;
    await sendPush({
      title: "Autopilot needs you",
      body: `${found[0].title}${found.length > 1 ? ` (+${found.length - 1} more)` : ""}`,
      url: `/owner/needs-you?id=${found[0].id}`,
      tag: `autopilot-${runId}`,
    });
  } catch (e) {
    console.warn("[push] autopilot", e instanceof Error ? e.message : e);
  }
}
