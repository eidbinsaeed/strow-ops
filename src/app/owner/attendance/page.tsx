import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;
function monthStartDubai(): string {
  const d = new Date(Date.now() + DUBAI_OFFSET_MS);
  return d.toISOString().slice(0, 7) + "-01";
}
function money(n: number): string {
  return Number(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function sickDeduction(dw: number, days: number): number {
  const f = (n: number) =>
    0.5 * dw * Math.max(0, Math.min(n, 45) - 15) + dw * Math.max(0, n - 45);
  return f(days);
}

type Staff = {
  id: string;
  name: string;
  role: string;
  employee_code: string | null;
  salary: number | string | null;
  is_on_shift: boolean;
};
type DayRow = { barista_id: string; status: string };
type Punch = { punched_at: string; direction: string; baristas: { name: string } | null };
type Leave = {
  id: string;
  kind: string;
  start_date: string;
  end_date: string | null;
  baristas: { name: string } | null;
};
type Device = { device_uid: string; is_active: boolean };
type Fixed = { amount: number | string };

export default async function OwnerAttendancePage() {
  const locale = await getLocale();
  const supabase = createServiceClient();
  const monthFrom = monthStartDubai();

  const [staffRes, daysRes, punchRes, leaveRes, devRes, fixedRes] = await Promise.all([
    supabase
      .from("baristas")
      .select("id, name, role, employee_code, salary, is_on_shift")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase.from("attendance_days").select("barista_id, status").gte("work_date", monthFrom),
    supabase
      .from("attendance_punches")
      .select("punched_at, direction, baristas(name)")
      .order("punched_at", { ascending: false })
      .limit(15),
    supabase
      .from("leave_requests")
      .select("id, kind, start_date, end_date, baristas(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.from("attendance_devices").select("device_uid, is_active").eq("is_active", true),
    supabase.from("fixed_costs").select("amount").eq("is_active", true),
  ]);

  const staff = (staffRes.data ?? []) as unknown as Staff[];
  const days = (daysRes.data ?? []) as unknown as DayRow[];
  const punches = (punchRes.data ?? []) as unknown as Punch[];
  const leave = (leaveRes.data ?? []) as unknown as Leave[];
  const devices = (devRes.data ?? []) as unknown as Device[];
  const fixed = (fixedRes.data ?? []) as unknown as Fixed[];

  const counts: Record<string, { present: number; absent: number; sick: number }> = {};
  for (const s of staff) counts[s.id] = { present: 0, absent: 0, sick: 0 };
  for (const d of days) {
    const c = counts[d.barista_id];
    if (!c) continue;
    if (d.status === "absent") c.absent++;
    else if (d.status === "sick") c.sick++;
    else if (d.status === "present" || d.status === "late") c.present++;
  }

  let grossTotal = 0;
  let dedTotal = 0;
  let netTotal = 0;
  let absencesTotal = 0;
  const rows = staff.map((s) => {
    const salary = s.salary == null ? 0 : Number(s.salary);
    const dw = salary / 30;
    const c = counts[s.id] ?? { present: 0, absent: 0, sick: 0 };
    const absDed = c.absent * dw;
    let ded = absDed + sickDeduction(dw, c.sick);
    const cap = salary * 0.5;
    if (ded > cap) ded = cap;
    const net = salary - ded;
    grossTotal += salary;
    dedTotal += ded;
    netTotal += net;
    absencesTotal += c.absent;
    return { ...s, salary, present: c.present, absent: c.absent, sick: c.sick, net };
  });

  const fixedMonthly = fixed.reduce((sum, f) => sum + Number(f.amount), 0);
  const onShift = staff.filter((s) => s.is_on_shift).length;

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-6">
        <h1 className="text-2xl font-light tracking-tight">{tr("page.attendance", locale)}</h1>
        <p className="mt-1 text-sm text-neutral-500">{tr("att.subtitle", locale)}</p>
      </header>

      {devices.length === 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {tr("att.device_none", locale)}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={tr("att.kpi.active", locale)} value={String(staff.length)} />
        <Kpi label={tr("att.kpi.onshift", locale)} value={String(onShift)} />
        <Kpi label={tr("att.kpi.absences", locale)} value={String(absencesTotal)} warn={absencesTotal > 0} />
        <Kpi label={tr("att.kpi.payroll", locale)} value={"AED " + money(netTotal)} />
      </div>

      <h2 className="mb-2 text-sm font-medium">{tr("att.roster", locale)}</h2>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">{tr("att.col.staff", locale)}</th>
              <th className="px-5 py-3 font-medium">{tr("att.col.id", locale)}</th>
              <th className="px-5 py-3 text-center font-medium">{tr("att.col.present", locale)}</th>
              <th className="px-5 py-3 text-center font-medium">{tr("att.col.absent", locale)}</th>
              <th className="px-5 py-3 text-center font-medium">{tr("att.col.sick", locale)}</th>
              <th className="px-5 py-3 text-right font-medium">{tr("att.col.salary", locale)}</th>
              <th className="px-5 py-3 text-right font-medium">{tr("att.col.net", locale)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr key={r.id} className="text-sm">
                <td className="px-5 py-4">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs capitalize text-neutral-500">{r.role}</div>
                </td>
                <td className="px-5 py-4 font-mono text-neutral-600">{r.employee_code ?? "—"}</td>
                <td className="px-5 py-4 text-center text-emerald-700">{r.present}</td>
                <td className="px-5 py-4 text-center">
                  {r.absent ? (
                    <span className="text-red-600">{r.absent}</span>
                  ) : (
                    <span className="text-neutral-400">0</span>
                  )}
                </td>
                <td className="px-5 py-4 text-center text-neutral-600">{r.sick}</td>
                <td className="px-5 py-4 text-right tabular-nums text-neutral-600">
                  {r.salary ? money(r.salary) : "—"}
                </td>
                <td className="px-5 py-4 text-right font-medium tabular-nums">{money(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium">{tr("att.payroll_title", locale)}</h2>
          <Row label={tr("att.gross", locale)} value={"AED " + money(grossTotal)} />
          <Row label={tr("att.deductions", locale)} value={"− AED " + money(dedTotal)} red />
          <div className="my-2 border-t border-neutral-100" />
          <Row label={tr("att.netpay", locale)} value={"AED " + money(netTotal)} bold />
          <Row label={tr("att.fixed_monthly", locale)} value={"AED " + money(fixedMonthly)} bold />
          <p className="mt-3 text-xs text-neutral-400">{tr("att.payroll_hint", locale)}</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium">{tr("att.leave", locale)}</h2>
          {leave.length === 0 ? (
            <p className="text-sm text-neutral-400">{tr("att.no_leave", locale)}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {leave.map((l) => (
                <li key={l.id} className="flex justify-between">
                  <span>
                    {(l.baristas?.name ?? "—") + " · " + l.kind}
                  </span>
                  <span className="text-neutral-500">
                    {l.start_date + (l.end_date ? " → " + l.end_date : "")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-medium">{tr("att.punches", locale)}</h2>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        {punches.length === 0 ? (
          <p className="p-6 text-sm text-neutral-400">{tr("att.no_punches", locale)}</p>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">{tr("att.col.staff", locale)}</th>
                <th className="px-5 py-3 font-medium">{tr("att.dir", locale)}</th>
                <th className="px-5 py-3 font-medium">{tr("att.date", locale)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {punches.map((p, i) => (
                <tr key={i} className="text-sm">
                  <td className="px-5 py-3">{p.baristas?.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    {p.direction === "in" ? tr("att.in", locale) : tr("att.out", locale)}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-neutral-500">
                    {new Date(p.punched_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner" className="underline hover:text-strow-ink">
          {tr("common.dashboard", locale)}
        </Link>
      </p>
    </div>
  );
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">{label}</div>
      <div className={"mt-1 text-2xl font-light " + (warn ? "text-red-600" : "")}>{value}</div>
    </div>
  );
}

function Row({ label, value, red, bold }: { label: string; value: string; red?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className={"tabular-nums " + (red ? "text-red-600 " : "") + (bold ? "font-medium" : "")}>
        {value}
      </span>
    </div>
  );
}
