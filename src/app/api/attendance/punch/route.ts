/**
 * Biometric terminal -> Strow.
 *
 * The face/finger terminal POSTs one record per scan. Authenticated by a
 * per-device secret in the `x-device-key` header (compared against
 * attendance_devices.secret_hash). Writes the raw punch and rolls it up into
 * the day record that drives Payroll. The owner can correct days later.
 *
 *   POST /api/attendance/punch
 *   Header: x-device-key: <secret>
 *   Body:   { "device_uid": "qave-main-01", "employee_code": "1101",
 *             "direction": "in" | "out", "timestamp": "2026-06-21T06:02:11+04:00" }
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4, no DST

// Local Dubai calendar date for a tz-aware instant.
function dubaiWorkDate(at: Date): string {
  return new Date(at.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
}
// Local Dubai time-of-day HH:MM:SS.
function dubaiTime(at: Date): string {
  return new Date(at.getTime() + DUBAI_OFFSET_MS).toISOString().slice(11, 19);
}
function toMinutes(hms: string): number {
  const [h, m] = hms.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

type DeviceRow = { id: string; location_id: string; secret_hash: string };
type BaristaRow = { id: string; name: string; location_id: string };
type DayRow = { id: string; first_in: string | null; last_out: string | null };
type PunchBody = {
  device_uid?: string;
  employee_code?: string;
  direction?: string;
  timestamp?: string;
};

export async function POST(request: Request) {
  const deviceKey = request.headers.get("x-device-key") ?? "";

  let body: PunchBody;
  try {
    body = (await request.json()) as PunchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const employeeCode = String(body.employee_code ?? "").trim();
  const direction = String(body.direction ?? "").trim();
  const deviceUid = String(body.device_uid ?? "").trim();

  if (!deviceKey)
    return NextResponse.json({ error: "missing_device_key" }, { status: 401 });
  if (!employeeCode)
    return NextResponse.json({ error: "missing_employee_code" }, { status: 400 });
  if (direction !== "in" && direction !== "out")
    return NextResponse.json({ error: "invalid_direction" }, { status: 400 });

  const punchedAt = body.timestamp ? new Date(body.timestamp) : new Date();
  if (Number.isNaN(punchedAt.getTime()))
    return NextResponse.json({ error: "invalid_timestamp" }, { status: 400 });

  const supabase = createServiceClient();

  // 1) Authenticate the device (uid optional; falls back to the only active one).
  let q = supabase
    .from("attendance_devices")
    .select("id, location_id, secret_hash")
    .eq("is_active", true);
  if (deviceUid) q = q.eq("device_uid", deviceUid);
  const { data: devices, error: devErr } = await q;
  if (devErr) {
    console.error("[punch] device lookup:", devErr);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  let device: DeviceRow | null = null;
  for (const d of (devices ?? []) as unknown as DeviceRow[]) {
    if (await bcrypt.compare(deviceKey, d.secret_hash)) {
      device = d;
      break;
    }
  }
  if (!device)
    return NextResponse.json({ error: "device_unauthorized" }, { status: 401 });

  // 2) Resolve the employee by their ID code.
  const { data: baristaData, error: bErr } = await supabase
    .from("baristas")
    .select("id, name, location_id")
    .eq("employee_code", employeeCode)
    .eq("is_active", true)
    .maybeSingle();
  if (bErr) {
    console.error("[punch] employee lookup:", bErr);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  const barista = baristaData as BaristaRow | null;
  if (!barista)
    return NextResponse.json({ error: "employee_not_found" }, { status: 404 });
  if (barista.location_id !== device.location_id)
    return NextResponse.json({ error: "location_mismatch" }, { status: 403 });

  // 3) Record the raw scan (append-only).
  const { error: pErr } = await supabase.from("attendance_punches").insert({
    location_id: device.location_id,
    barista_id: barista.id,
    device_id: device.id,
    punched_at: punchedAt.toISOString(),
    direction,
    source: "device",
  });
  if (pErr) {
    console.error("[punch] insert:", pErr);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // 4) Device heartbeat.
  await supabase
    .from("attendance_devices")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", device.id);

  // 5) Roll up into the day record (one row per staff per day).
  const workDate = dubaiWorkDate(punchedAt);
  const timeOfDay = dubaiTime(punchedAt);
  const { data: dayData } = await supabase
    .from("attendance_days")
    .select("id, first_in, last_out")
    .eq("barista_id", barista.id)
    .eq("work_date", workDate)
    .maybeSingle();
  const day = dayData as DayRow | null;

  if (!day) {
    await supabase.from("attendance_days").insert({
      location_id: device.location_id,
      barista_id: barista.id,
      work_date: workDate,
      status: "present",
      first_in: direction === "in" ? timeOfDay : null,
      last_out: direction === "out" ? timeOfDay : null,
    });
  } else {
    const patch: Record<string, unknown> = {};
    if (direction === "in" && !day.first_in) patch.first_in = timeOfDay;
    if (direction === "out") patch.last_out = timeOfDay;
    if (day.first_in && direction === "out") {
      const worked = toMinutes(timeOfDay) - toMinutes(day.first_in);
      if (worked >= 0) patch.worked_minutes = worked;
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from("attendance_days").update(patch).eq("id", day.id);
    }
  }

  return NextResponse.json({
    ok: true,
    name: barista.name,
    direction,
    work_date: workDate,
    at: timeOfDay,
  });
}
