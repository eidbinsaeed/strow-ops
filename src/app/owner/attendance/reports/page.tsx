import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import { StaffSelect } from "./StaffSelect";
import { StaffReports } from "./StaffReports";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OFF = 4 * 60 * 60 * 1000;
function dubaiNow(): Date {
  return new Date(Date.now() + OFF);
}

type Staff = { id: string; name: string; role: string };
type DayRow = { barista_id: string; work_date: string; status: string };
type Report = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  severity: string | null;
  occurred_on: string;
  acknowledged_at: string | null;
};

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        {label}
      </div>
      <div className={"mt-1 text-2xl font-light " + (warn ? "text-red-600" : "")}>
        {value}
      </div>
    </div>
  );
}

export default async function StaffReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string }>;
}) {
  const locale = await getLocale();
  const supabase = createServiceClient();
  const sp = await searchParams;

  const { data: staffData } = await supabase
    .from("baristas")
    .select("id, name, role")
    .eq("is_active", true)
    .order("name", { ascending: true });
  const staff = (staffData ?? []) as unknown as Staff[];

  const selectedId =
    sp?.staff && staff.some((s) => s.id === sp.staff) ? sp.staff : null;
  const selected = selectedId ? staff.find((s) => s.id === selectedId)! : null;

  const now = dubaiNow();
  const monthFrom = now.toISOString().slice(0, 7) + "-01";
  const dayOfMonth = now.getUTCDate();

  const header = (
    <header className="mb-5">
      <h1 className="text-2xl font-light tracking-tight">{tr("rep.title", locale)}</h1>
      <p className="mt-1 text-sm text-neutral-500">{tr("rep.subtitle", locale)}</p>
      <div className="mt-3">
        <StaffSelect staff={staff} selected={selectedId} allLabel={tr("rep.all", locale)} />
      </div>
    </header>
  );

  if (!selected) {
    const [{ data: dData }, { data: rData }] = await Promise.all([
      supabase.from("attendance_days").select("barista_id, status").gte("work_date", monthFrom),
      supabase.from("staff_reports").select("barista_id, kind"),
    ]);
    const days = (dData ?? []) as unknown as { barista_id: string; status: string }[];
    const reps = (rData ?? []) as unknown as { barista_id: string; kind: string }[];
    const overview = staff.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      absent: days.filter((d) => d.barista_id === s.id && d.status === "absent").length,
      warnings: reps.filter((r) => r.barista_id === s.id && r.kind === "warning").length,
      incidents: reps.filter((r) => r.barista_id === s.id && r.kind === "incident").length,
    }));

    return (
      <div className="px-6 py-8 md:px-10">
        {header}
        <h2 className="mb-2 text-sm font-medium">{tr("rep.overview", locale)}</h2>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">{tr("att.col.staff", locale)}</th>
                <th className="px-5 py-3 text-center font-medium">{tr("att.col.absent", locale)}</th>
                <th className="px-5 py-3 text-center font-medium">{tr("rep.kpi.warnings", locale)}</th>
                <th className="px-5 py-3 text-center font-medium">{tr("rep.kpi.incidents", locale)}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {overview.map((o) => (
                <tr key={o.id} className="text-sm">
                  <td className="px-5 py-3">
                    <span className="font-medium">{o.name}</span>{" "}
                    <span className="text-xs capitalize text-neutral-500">{o.role}</span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {o.absent ? <span className="text-red-600">{o.absent}</span> : "0"}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {o.warnings ? <span className="text-amber-700">{o.warnings}</span> : "0"}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {o.incidents ? <span className="text-red-600">{o.incidents}</span> : "0"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/owner/attendance/reports?staff=${o.id}`}
                      className="text-xs text-strow-ink underline"
                    >
                      →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-neutral-400">{tr("rep.pick_hint", locale)}</p>
      </div>
    );
  }

  // ---- per-staff ----
  const [{ data: dData }, { data: rData }] = await Promise.all([
    supabase
      .from("attendance_days")
      .select("barista_id, work_date, status")
      .eq("barista_id", selectedId),
    supabase
      .from("staff_reports")
      .select("id, kind, title, detail, severity, occurred_on, acknowledged_at")
      .eq("barista_id", selectedId)
      .order("occurred_on", { ascending: false }),
  ]);
  const days = (dData ?? []) as unknown as DayRow[];
  const reports = (rData ?? []) as unknown as Report[];

  const monthDays = days.filter((d) => d.work_date >= monthFrom);
  const absentM = monthDays.filter((d) => d.status === "absent").length;
  const workdays = Math.max(dayOfMonth, 1);
  const attendancePct = Math.max(0, Math.round(((workdays - absentM) / workdays) * 100));
  const warnings = reports.filter((r) => r.kind === "warning").length;
  const incidents = reports.filter((r) => r.kind === "incident").length;

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
    <div className="px-6 py-8 md:px-10">
      {header}

      <div className="mb-1 text-lg font-medium">
        {selected.name}{" "}
        <span className="text-sm capitalize text-neutral-500">{selected.role}</span>
      </div>

      <div className="mb-5 mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={tr("rep.kpi.attendance", locale)} value={attendancePct + "%"} />
        <Kpi label={tr("rep.kpi.absent", locale)} value={String(absentM)} warn={absentM > 0} />
        <Kpi label={tr("rep.kpi.warnings", locale)} value={String(warnings)} warn={warnings > 0} />
        <Kpi label={tr("rep.kpi.incidents", locale)} value={String(incidents)} warn={incidents > 0} />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <div className="flex items-center gap-5 rounded-2xl border border-neutral-200 bg-white p-5">
          <div
            className="h-28 w-28 flex-shrink-0 rounded-full"
            style={{
              background: `conic-gradient(#5b9bd5 0 ${attendancePct}%, #3f3f46 ${attendancePct}% 100%)`,
            }}
          />
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#5b9bd5" }} />
              {tr("rep.present", locale)} · {attendancePct}%
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#3f3f46" }} />
              {tr("rep.absent", locale)} · {100 - attendancePct}%
            </div>
            <div className="mt-2 text-xs text-neutral-400">{tr("rep.kpi.attendance", locale)}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-medium">{tr("rep.months", locale)}</h2>
          {months.length === 0 ? (
            <p className="text-sm text-neutral-400">{tr("att.log.empty", locale)}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="py-1 font-medium">{tr("rep.month", locale)}</th>
                  <th className="py-1 text-center font-medium">{tr("att.col.absent", locale)}</th>
                  <th className="py-1 text-center font-medium">{tr("att.col.sick", locale)}</th>
                  <th className="py-1 text-center font-medium">{tr("att.st.off", locale)}</th>
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
      </div>

      <h2 className="mb-2 text-sm font-medium">{tr("rep.records", locale)}</h2>
      <StaffReports
        staffId={selected.id}
        staffName={selected.name}
        cafe="Qavè Cafe"
        reports={reports}
        locale={locale}
      />

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner/attendance" className="underline hover:text-strow-ink">
          {tr("att.back", locale)}
        </Link>
      </p>
    </div>
  );
}
