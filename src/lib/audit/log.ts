/**
 * Audit log helper.
 *
 * Writes one row to `audit_log` per meaningful state change. Never throws —
 * audit failure must NEVER block a successful business write. We log to
 * console.error if the audit insert fails so we can backfill later.
 *
 * The schema is intentionally generic (entity_type as text) so we don't have
 * to migrate when new entities are added.
 */
import { createServiceClient } from "@/lib/supabase/server";

export type ActorType = "barista" | "owner" | "system";

export type AuditEntry = {
  actor_id: string | null;
  actor_type: ActorType;
  action: string; // 'created', 'updated', 'deleted', 'confirmed', 'rotated_pin', etc.
  entity_type: string; // 'closing', 'expense', 'supplier', 'barista', etc.
  entity_id: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("audit_log").insert({
      actor_id: entry.actor_id,
      actor_type: entry.actor_type,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      before_state: entry.before_state ?? null,
      after_state: entry.after_state ?? null,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[audit] insert failed:", error.message, entry);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[audit] threw:", e, entry);
  }
}
