import { redirect } from "next/navigation";
import Link from "next/link";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { MyRecord } from "./MyRecord";

export const dynamic = "force-dynamic";

const OFF = 4 * 60 * 60 * 1000;
function dubaiNow(): Date {
  return new Date(Date.now() + OFF);
}

type DayRow = { work_date: string; status: string };
type Report = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  severity: string | null;
  occurred_on: string;
  acknowledged_at: string | null;
};

export default async function MyRecordPage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const supabase = createServiceClient();
  const [{ data: dData }, { data: rData }] = await Promise.all([
    supabase
      .from("attendance_days")
      .select("work_date, status")
      .eq("barista_id", session.bid),
    supabase
      .from("staff_reports")
      .select("id, kind, title, detail, severity, occurred_on, acknowledged_at")
      .eq("barista_id", session.bid)
      .order("occurred_on", { ascending: false }),
  ]);
  const days = (dData ?? []) as unknown as DayRow[];
  const reports = (rData ?? []) as unknown as Report[];

  const now = dubaiNow();
  const monthFrom = now.toISOString().slice(0, 7) + "-01";
  const workdays = Math.max(now.getUTCDate(), 1);
  const monthDays = days.filter((d) => d.work_date >= monthFrom);
  const absentM = monthDays.filter((d) => d.status === "absent").length;
  const sickM = monthDays.filter((d) => d.status === "sick").length;
  const attendancePct = Math.max(0, Math.round(((workdays - absentM) / workdays) * 100));

  const byMonth: Record<string, { absent: number; sick: number; off: number }> = {};
  for (const d of days) {
    const m = d.work_date.slice(0, 7);
    byMonth[m] = byMonth[m] ?? { absent: 0, sick: 0, off: 0 };
    if (d.status === "absent") byMonth[m].absent++;
    else if (d.status === "sick") byMonth[m].sick++;
    else if (d.status === "off") byMonth[m].off++;
  }
  const months = Object.keys(byMonth).sort().reverse();

  return (
    <main className="flex min-h-dvh flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Link href="/home" className="text-sm text-neutral-500">
          ‹ Home
        </Link>
        <p className="text-sm font-medium">My Record</p>
        <span className="w-12" />
      </header>

      <div className="mx-auto w-full max-w-md space-y-5 py-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium">My attendance · this month</h2>
          <div className="flex items-center gap-5">
            <div
              className="h-24 w-24 flex-shrink-0 rounded-full"
              style={{
                background: `conic-gradient(#5b9bd5 0 ${attendancePct}%, #3f3f46 ${attendancePct}% 100%)`,
              }}
            />
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#5b9bd5" }} />
                Present · {attendancePct}%
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#3f3f46" }} />
                Absent · {100 - attendancePct}%
              </div>
              <div className="mt-2 text-xs text-neutral-400">
                {absentM} absent · {sickM} sick this month
              </div>
            </div>
          </div>
          {months.length > 0 && (
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="py-1 font-medium">Month</th>
                  <th className="py-1 text-center font-medium">Absent</th>
                  <th className="py-1 text-center font-medium">Sick</th>
                  <th className="py-1 text-center font-medium">Off</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m} className="border-t border-neutral-100">
                    <td className="py-1.5 tabular-nums">{m}</td>
                    <td className="py-1.5 text-center text-red-600">{byMonth[m].absent || 0}</td>
                    <td className="py-1.5 text-center">{byMonth[m].sick || 0}</td>
                    <td className="py-1.5 text-center">{byMonth[m].off || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <MyRecord reports={reports} />
      </div>
    </main>
  );
}
