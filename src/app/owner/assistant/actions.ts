"use server";

import { revalidatePath } from "next/cache";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { saveSettings } from "@/lib/settings";

export async function setAiDeep(on: boolean): Promise<{ ok?: boolean; error?: string }> {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  try {
    await saveSettings({ aiDeep: !!on });
    revalidatePath("/owner/assistant/activity");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setAiBudget(usd: number): Promise<{ ok?: boolean; error?: string }> {
  if (!(await getOwnerSession())) return { error: "Sign in again" };
  if (![10, 20, 40, 80].includes(usd)) return { error: "Pick 10, 20, 40 or 80" };
  try {
    await saveSettings({ aiMonthlyBudget: usd });
    revalidatePath("/owner/assistant/activity");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
