/**
 * Live updates: tell every open owner screen that something changed, so it
 * refreshes on the spot (Supabase Realtime broadcast, public topic).
 * The payload carries no business data — just which table changed — and the
 * screen then fetches the details with the owner's login. Best-effort: never
 * throws and gives up after 2.5 s, so it can't slow a barista's submit.
 */
export async function broadcastLive(payload: { t: string; id?: string | null }): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: "strow-live", event: "change", payload }] }),
      signal: ctrl.signal,
    });
  } catch {
    /* live updates are best-effort */
  } finally {
    clearTimeout(timer);
  }
}
