"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { getOwnerActor } from "@/lib/auth/owner-session";
import { nextEmployeeCode } from "@/lib/hr/codes";

const PIN_REGEX = /^\d{4}$/;

/**
 * Keep a barista's salary mirrored as a single active fixed_costs row
 * (kind='salary', linked_barista_id), so "Fixed monthly" (= sum of active
 * fixed_costs) always reflects the current salary. Null salary deactivates it.
 */
async function syncSalaryFixedCost(
  supabase: SupabaseClient,
  barista: { id: string; name: string; location_id: string; salary: number | null },
) {
  const { data: existing } = await supabase
    .from("fixed_costs")
    .select("id")
    .eq("linked_barista_id", barista.id)
    .eq("kind", "salary")
    .limit(1)
    .maybeSingle();
  const existingId = (existing as { id: string } | null)?.id ?? null;

  if (barista.salary == null) {
    if (existingId) {
      await supabase.from("fixed_costs").update({ is_active: false }).eq("id", existingId);
    }
    return;
  }

  if (existingId) {
    await supabase
      .from("fixed_costs")
      .update({ amount: barista.salary, is_active: true, name: `${barista.name} salary` })
      .eq("id", existingId);
  } else {
    await supabase.from("fixed_costs").insert({
      location_id: barista.location_id,
      name: `${barista.name} salary`,
      kind: "salary",
      amount: barista.salary,
      frequency: "monthly",
      due_day: 1,
      linked_barista_id: barista.id,
      is_active: true,
    });
  }
}

export async function createBarista(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "barista").trim() || "barista";
  const pin = String(formData.get("pin") ?? "").trim();
  const salaryRaw = String(formData.get("salary") ?? "").trim();
  const salary = salaryRaw === "" ? null : parseFloat(salaryRaw);

  if (!name) return { error: "Name is required" };
  if (!PIN_REGEX.test(pin)) return { error: "PIN must be exactly 4 digits" };
  if (salary !== null && (Number.isNaN(salary) || salary < 0)) {
    return { error: "Invalid salary" };
  }

  const supabase = createServiceClient();

  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("slug", "qave_main")
    .single();
  if (!location) return { error: "Default location not found" };

  const pin_hash = await bcrypt.hash(pin, 10);
  const employee_code = await nextEmployeeCode(supabase, role);

  const { data: inserted, error } = await supabase
    .from("baristas")
    .insert({
      location_id: location.id,
      name,
      role,
      pin_hash,
      employee_code,
      salary,
      is_active: true,
      is_on_shift: false,
    })
    .select("id")
    .single();

  if (error || !inserted) return { error: error?.message ?? "Insert failed" };

  if (salary != null) {
    await syncSalaryFixedCost(supabase, {
      id: inserted.id,
      name,
      location_id: location.id,
      salary,
    });
  }

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "created",
    entity_type: "barista",
    entity_id: inserted.id,
    after_state: { name, role, employee_code, salary },
  });

  revalidatePath("/owner/baristas");
  revalidatePath("/owner/fixed-costs");
  revalidatePath("/owner");
  return { ok: true, employee_code };
}

export async function setBaristaSalary(id: string, amountRaw: string) {
  const trimmed = (amountRaw ?? "").trim();
  const amount = trimmed === "" ? null : parseFloat(trimmed);
  if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
    return { error: "Invalid salary" };
  }

  const supabase = createServiceClient();
  const { data: b, error: selErr } = await supabase
    .from("baristas")
    .select("id, name, location_id")
    .eq("id", id)
    .maybeSingle();
  if (selErr || !b) return { error: selErr?.message ?? "Staff not found" };
  const barista = b as { id: string; name: string; location_id: string };

  const { error } = await supabase.from("baristas").update({ salary: amount }).eq("id", id);
  if (error) return { error: error.message };

  await syncSalaryFixedCost(supabase, { ...barista, salary: amount });

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "salary_set",
    entity_type: "barista",
    entity_id: id,
    after_state: { salary: amount },
  });

  revalidatePath("/owner/baristas");
  revalidatePath("/owner/fixed-costs");
  revalidatePath("/owner");
  return { ok: true };
}

export async function toggleOnShift(id: string, currentlyOn: boolean) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("baristas")
    .update({ is_on_shift: !currentlyOn })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: !currentlyOn ? "shift_started" : "shift_ended",
    entity_type: "barista",
    entity_id: id,
    before_state: { is_on_shift: currentlyOn },
    after_state: { is_on_shift: !currentlyOn },
  });

  revalidatePath("/owner/baristas");
  revalidatePath("/owner");
  return { ok: true };
}

export async function rotateBaristaPin(id: string, newPin: string) {
  if (!PIN_REGEX.test(newPin)) {
    return { error: "PIN must be exactly 4 digits" };
  }
  const supabase = createServiceClient();
  const pin_hash = await bcrypt.hash(newPin, 10);
  const { error } = await supabase.from("baristas").update({ pin_hash }).eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "pin_rotated",
    entity_type: "barista",
    entity_id: id,
  });

  revalidatePath("/owner/baristas");
  return { ok: true };
}

export async function deactivateBarista(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("baristas")
    .update({ is_active: false, is_on_shift: false })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "deactivated",
    entity_type: "barista",
    entity_id: id,
  });

  revalidatePath("/owner/baristas");
  revalidatePath("/owner");
  return { ok: true };
}

export async function reactivateBarista(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("baristas")
    .update({ is_active: true })
    .eq("id", id);
  if (error) return { error: error.message };

  const actor = await getOwnerActor();
  await writeAudit({
    actor_id: actor.id,
    actor_type: actor.type,
    action: "reactivated",
    entity_type: "barista",
    entity_id: id,
  });

  revalidatePath("/owner/baristas");
  return { ok: true };
}
