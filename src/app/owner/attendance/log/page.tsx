import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import { AttendanceLogEditor } from "./AttendanceLogEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function monthStartDubai(): string {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 7) + "-01";
}

type Rec = {
  barista_id: string;
  work_date: string;
  status: string;
  baristas: { name: string; role: string } | null;
};
type Staff = { id: string; name: string; role: string };

export default async function AttendanceLogPage() {
  const locale = await getLocale();
  const supabase = createServiceClient();
  const monthFrom = monthStartDubai();

  const [recRes, staffRes] = await Promise.all([
    supabase
      .from("attendance_days")
      .select("barista_id, work_date, status, baristas(name, role)")
      .gte("work_date", monthFrom)
      .order("work_date", { ascending: false }),
    supabase
      .from("baristas")
      .select("id, name, role")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const records = (recRes.data ?? []) as unknown as Rec[];
  const staff = (staffRes.data ?? []) as unknown as Staff[];
  const items = records.map((r) => ({
    baristaId: r.barista_id,
    name: r.baristas?.name ?? "—",
    role: r.baristas?.role ?? "",
    date: r.work_date,
    status: r.status,
  }));

  return (
    <div className="px-6 py-8 md:px-10">
      <header className="mb-4">
        <h1 className="text-2xl font-light tracking-tight">{tr("att.log.title", locale)}</h1>
        <p className="mt-1 text-sm text-neutral-500">{tr("att.log.subtitle", locale)}</p>
      </header>

      <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        {tr("att.log.banner", locale)}
      </div>

      <AttendanceLogEditor items={items} staff={staff} locale={locale} />

      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner/attendance" className="underline hover:text-strow-ink">
          {tr("att.back", locale)}
        </Link>
      </p>
    </div>
  );
}
