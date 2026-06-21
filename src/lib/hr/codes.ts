/**
 * Structured employee ID codes for staff.
 *
 * Format: "1" (branch) + role digit + 2-digit serial.
 *   role digit: barista=1, waiter=2, manager=9, other=8
 *   serial:     next available within that role
 *
 * Examples: first barista -> 1101, third waiter -> 1203.
 * Meaningful and deterministic — never random.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export function roleDigit(role: string): string {
  switch ((role || "").toLowerCase()) {
    case "barista":
      return "1";
    case "waiter":
      return "2";
    case "manager":
      return "9";
    default:
      return "8";
  }
}

type CodeRow = { employee_code: string | null };

/**
 * Returns the next free employee code for a role (e.g. "1204").
 * Considers active and inactive staff so codes are never reused.
 */
export async function nextEmployeeCode(
  supabase: SupabaseClient,
  role: string,
): Promise<string> {
  const prefix = "1" + roleDigit(role);
  const { data } = await supabase
    .from("baristas")
    .select("employee_code")
    .like("employee_code", `${prefix}%`);

  let max = 0;
  for (const row of (data ?? []) as unknown as CodeRow[]) {
    const code = row.employee_code;
    if (!code || code.length < 4) continue;
    const serial = parseInt(code.slice(2), 10);
    if (!Number.isNaN(serial) && serial > max) max = serial;
  }
  return prefix + String(max + 1).padStart(2, "0");
}
