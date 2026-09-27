/**
 * Safety net for personal finance: a full copy of every finance table, saved
 * privately in Supabase Storage (strow-system/finance-backups/<day>/…).
 * Taken once a day (on the first visit and before the first save), and always
 * before a person is deleted. Best-effort: logs and never blocks a save.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAll } from "./load";

const BUCKET = "strow-system";
let doneDay: string | null = null;

export async function backupFinance(reason: string, force = false): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (!force && doneDay === day) return;
    const db = createServiceClient();
    const dir = `finance-backups/${day}`;
    if (!force) {
      const { data } = await db.storage.from(BUCKET).list(dir, { limit: 1 });
      if (data && data.length) {
        doneDay = day;
        return;
      }
    }
    const [lines, plans, people, payments] = await Promise.all([
      fetchAll<Record<string, unknown>>((a, b) => db.from("finance_budget_lines").select("*").order("id").range(a, b)),
      fetchAll<Record<string, unknown>>((a, b) => db.from("finance_installments").select("*").order("id").range(a, b)),
      fetchAll<Record<string, unknown>>((a, b) => db.from("finance_people").select("*").order("id").range(a, b)),
      fetchAll<Record<string, unknown>>((a, b) => db.from("finance_payments").select("*").order("id").range(a, b)),
    ]);
    const { error: bucketErr } = await db.storage.createBucket(BUCKET, { public: false });
    if (bucketErr && !/exist/i.test(bucketErr.message)) throw new Error(bucketErr.message);
    const body = JSON.stringify({
      at: new Date().toISOString(),
      reason,
      finance_budget_lines: lines,
      finance_installments: plans,
      finance_people: people,
      finance_payments: payments,
    });
    const safe = reason.replace(/[^a-z0-9-]/gi, "").slice(0, 30) || "backup";
    const { error } = await db.storage.from(BUCKET).upload(`${dir}/${Date.now()}-${safe}.json`, Buffer.from(body), { contentType: "application/json", upsert: false });
    if (error) throw new Error(error.message);
    doneDay = day;
  } catch (e) {
    console.warn("[finance-backup]", e instanceof Error ? e.message : e);
  }
}
