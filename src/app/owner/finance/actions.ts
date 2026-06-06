"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner-session";

type Result = { ok?: boolean; error?: string };

async function guard(): Promise<Result | null> {
  const s = await getOwnerSession();
  if (!s) return { error: "Not signed in" };
  return null;
}

async function locationId(supabase: ReturnType<typeof createServiceClient>): Promise<string | null> {
  const { data } = await supabase.from("locations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return (data?.id as string) ?? null;
}

const n = (v: unknown) => {
  const x = parseFloat(String(v ?? "")); return isNaN(x) ? 0 : x;
};

export type BudgetLineInput = { section: "income" | "expense" | "wife"; label: string; amount: number; checked: boolean; note?: string | null };

/** Replace all budget lines for a given month. */
export async function saveBudget(month: string, lines: BudgetLineInput[]): Promise<Result> {
  const g = await guard(); if (g) return g;
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Bad month" };
  const supabase = createServiceClient();
  const loc = await locationId(supabase);
  if (!loc) return { error: "No location" };

  await supabase.from("finance_budget_lines").delete().eq("location_id", loc).eq("month", month);
  if (lines.length) {
    const rows = lines.map((l, i) => ({
      location_id: loc, month, section: l.section, label: l.label ?? "",
      amount: n(l.amount), checked: !!l.checked, note: l.note ?? null, position: i,
    }));
    const { error } = await supabase.from("finance_budget_lines").insert(rows);
    if (error) return { error: error.message };
  }
  revalidatePath("/owner/finance");
  return { ok: true };
}

/* ---------- Debts ---------- */
export async function addPerson(): Promise<Result> {
  const g = await guard(); if (g) return g;
  const supabase = createServiceClient();
  const loc = await locationId(supabase); if (!loc) return { error: "No location" };
  const { error } = await supabase.from("finance_people").insert({ location_id: loc, name: "اسم جديد", original_amount: 0 });
  if (error) return { error: error.message };
  revalidatePath("/owner/finance"); return { ok: true };
}

export async function updatePerson(id: string, patch: { name?: string; original_amount?: number; note?: string | null }): Promise<Result> {
  const g = await guard(); if (g) return g;
  const supabase = createServiceClient();
  const upd: Record<string, unknown> = {};
  if (patch.name !== undefined) upd.name = patch.name;
  if (patch.original_amount !== undefined) upd.original_amount = n(patch.original_amount);
  if (patch.note !== undefined) upd.note = patch.note;
  const { error } = await supabase.from("finance_people").update(upd).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/owner/finance"); return { ok: true };
}

export async function deletePerson(id: string): Promise<Result> {
  const g = await guard(); if (g) return g;
  const supabase = createServiceClient();
  const { error } = await supabase.from("finance_people").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/owner/finance"); return { ok: true };
}

export async function recordPayment(personId: string, amount: number, paidOn: string): Promise<Result> {
  const g = await guard(); if (g) return g;
  if (!personId || !amount) return { error: "Pick a person and amount" };
  const supabase = createServiceClient();
  const loc = await locationId(supabase); if (!loc) return { error: "No location" };
  const { error } = await supabase.from("finance_payments").insert({
    location_id: loc, person_id: personId, amount: n(amount), paid_on: paidOn || new Date().toISOString().slice(0, 10),
  });
  if (error) return { error: error.message };
  revalidatePath("/owner/finance"); return { ok: true };
}

export async function deletePayment(id: string): Promise<Result> {
  const g = await guard(); if (g) return g;
  const supabase = createServiceClient();
  const { error } = await supabase.from("finance_payments").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/owner/finance"); return { ok: true };
}

/* ---------- Installments ---------- */
export type InstallmentInput = { name: string; group_name: string; total: number; installments_count: number; start_month: string; paid_count: number };

/** Replace all installment plans. */
export async function saveInstallments(list: InstallmentInput[]): Promise<Result> {
  const g = await guard(); if (g) return g;
  const supabase = createServiceClient();
  const loc = await locationId(supabase); if (!loc) return { error: "No location" };
  await supabase.from("finance_installments").delete().eq("location_id", loc);
  if (list.length) {
    const rows = list.map((it, i) => ({
      location_id: loc, name: it.name ?? "", group_name: it.group_name ?? null,
      total: n(it.total), installments_count: Math.max(parseInt(String(it.installments_count)) || 1, 1),
      start_month: it.start_month ?? null, paid_count: Math.max(parseInt(String(it.paid_count)) || 0, 0), position: i,
    }));
    const { error } = await supabase.from("finance_installments").insert(rows);
    if (error) return { error: error.message };
  }
  revalidatePath("/owner/finance"); return { ok: true };
}

export type PersonInput = {
  name: string;
  original_amount: number;
  note?: string | null;
  payments: { amount: number; paid_on: string }[];
};

/** Replace all people + their payments in one shot (keeps debts editing simple + live). */
export async function savePeople(list: PersonInput[]): Promise<Result> {
  const g = await guard(); if (g) return g;
  const supabase = createServiceClient();
  const loc = await locationId(supabase); if (!loc) return { error: "No location" };

  // Cascade deletes payments too.
  await supabase.from("finance_people").delete().eq("location_id", loc);

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const { data: ins, error } = await supabase
      .from("finance_people")
      .insert({ location_id: loc, name: p.name ?? "", original_amount: n(p.original_amount), note: p.note ?? null, position: i })
      .select("id")
      .maybeSingle();
    if (error) return { error: error.message };
    const pid = ins?.id as string | undefined;
    if (pid && p.payments?.length) {
      const rows = p.payments.map((x) => ({
        location_id: loc, person_id: pid, amount: n(x.amount),
        paid_on: x.paid_on || new Date().toISOString().slice(0, 10),
      }));
      const { error: pe } = await supabase.from("finance_payments").insert(rows);
      if (pe) return { error: pe.message };
    }
  }
  revalidatePath("/owner/finance");
  return { ok: true };
}
