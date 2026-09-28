"use server";

import { revalidatePath } from "next/cache";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";

/** Use the order count the AI read from a photo that needed a check. */
export async function acceptOrderScan(closingId: string): Promise<{ ok?: boolean; error?: string }> {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  const db = createServiceClient();
  const { data } = await db.from("closing_order_scans").select("read").eq("closing_id", closingId).maybeSingle();
  const read = ((data as { read?: Record<string, unknown> } | null)?.read ?? {}) as { transactions?: number | null; by_method?: Record<string, number> | null };
  if (read.transactions == null) return { error: "No count was read — type it in with Edit" };
  const { error } = await db.from("closings").update({ transactions: read.transactions, transactions_by_method: read.by_method ?? null }).eq("id", closingId);
  if (error) return { error: error.message };
  await db.from("closing_order_scans").update({ status: "filled", reason: "Accepted by owner" }).eq("closing_id", closingId);
  revalidatePath("/owner/closings");
  revalidatePath("/owner");
  return { ok: true };
}
