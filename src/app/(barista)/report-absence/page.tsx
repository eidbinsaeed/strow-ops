import { redirect } from "next/navigation";
import Link from "next/link";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { ReportAbsenceList } from "./ReportAbsenceList";

export const dynamic = "force-dynamic";

function dubaiToday(): string {
  return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Waiter = { id: string; name: string; employee_code: string | null };
type DayRow = { barista_id: string; status: string };

export default async function ReportAbsencePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const supabase = createServiceClient();
  const { data: meData } = await supabase
    .from("baristas")
    .select("role")
    .eq("id", session.bid)
    .maybeSingle();
  const myRole = ((meData as { role?: string } | null)?.role ?? "").toLowerCase();
  if (myRole === "waiter") redirect("/home");

  const sp = await searchParams;
  const date =
    sp?.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : dubaiToday();

  const { data: wData } = await supabase
    .from("baristas")
    .select("id, name, employee_code")
    .eq("is_active", true)
    .eq("role", "waiter")
    .order("name", { ascending: true });
  const waiters = (wData ?? []) as unknown as Waiter[];

  const { data: dData } = await supabase
    .from("attendance_days")
    .select("barista_id, status")
    .eq("work_date", date);
  const absent = new Set(
    ((dData ?? []) as unknown as DayRow[])
      .filter((d) => d.status === "absent")
      .map((d) => d.barista_id),
  );

  const items = waiters.map((w) => ({
    id: w.id,
    name: w.name,
    code: w.employee_code,
    absent: absent.has(w.id),
  }));

  return (
    <main className="flex min-h-dvh flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Link href="/home" className="text-sm text-neutral-500">
          ‹ Home
        </Link>
        <p className="text-sm font-medium">Report Absence</p>
        <span className="w-12" />
      </header>
      <div className="mx-auto w-full max-w-md py-6">
        <p className="mb-4 text-center text-sm text-neutral-500">
          Everyone counts as present. Only flip a waiter to Absent if they did
          not come in.
        </p>
        <ReportAbsenceList items={items} date={date} />
      </div>
    </main>
  );
}
