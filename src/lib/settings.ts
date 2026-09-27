/**
 * App settings (auto-approve switches) kept in private Supabase Storage.
 * Each save writes a new timestamped file and reads take the newest one, so a
 * change is seen immediately (no cached copy of an overwritten file).
 */
import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "strow-system";
const DIR = "settings";

export type AppSettings = {
  /** Clean closings go straight into the books; flagged ones always wait. */
  autoApproveClosings: boolean;
  /** Clean purchase bills go straight into the books; flagged ones always wait. */
  autoApproveBills: boolean;
};

const DEFAULTS: AppSettings = { autoApproveClosings: true, autoApproveBills: true };

async function newest(): Promise<string | null> {
  const { data } = await createServiceClient().storage.from(BUCKET).list(DIR, { limit: 100, sortBy: { column: "name", order: "desc" } });
  const files = (data ?? []).map((f) => f.name).filter((n) => /^app-\d+\.json$/.test(n)).sort().reverse();
  return files[0] ?? null;
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const name = await newest();
    if (!name) return { ...DEFAULTS };
    const { data, error } = await createServiceClient().storage.from(BUCKET).download(`${DIR}/${name}`);
    if (error || !data) return { ...DEFAULTS };
    const j = JSON.parse(await data.text()) as Partial<AppSettings>;
    return {
      autoApproveClosings: typeof j.autoApproveClosings === "boolean" ? j.autoApproveClosings : DEFAULTS.autoApproveClosings,
      autoApproveBills: typeof j.autoApproveBills === "boolean" ? j.autoApproveBills : DEFAULTS.autoApproveBills,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const db = createServiceClient();
  const next = { ...(await getSettings()), ...patch };
  const { error: bucketErr } = await db.storage.createBucket(BUCKET, { public: false });
  if (bucketErr && !/exist/i.test(bucketErr.message)) throw new Error(bucketErr.message);
  const { error } = await db.storage.from(BUCKET).upload(`${DIR}/app-${Date.now()}.json`, Buffer.from(JSON.stringify(next)), { contentType: "application/json", upsert: false });
  if (error) throw new Error(error.message);
  // Keep the last few versions only.
  const { data } = await db.storage.from(BUCKET).list(DIR, { limit: 100 });
  const old = (data ?? []).map((f) => f.name).filter((n) => /^app-\d+\.json$/.test(n)).sort().reverse().slice(5);
  if (old.length) await db.storage.from(BUCKET).remove(old.map((n) => `${DIR}/${n}`));
  return next;
}
