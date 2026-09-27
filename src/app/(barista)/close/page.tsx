import Link from "next/link";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { todayDubai, validPastOrToday } from "@/lib/dates";
import { BackIcon } from "@/components/pulse/icons";
import { CloseFlow } from "./CloseFlow";

export const dynamic = "force-dynamic";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function ClosePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  // ?date=YYYY-MM-DD deep-links straight to a day (e.g. from "missing closings").
  const initialDate = validPastOrToday(date) ? date : undefined;
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  // Recent days with no closing, newest first, so they can be filled in one tap.
  const today = todayDubai();
  const from = addDays(today, -45);
  const { data } = await createServiceClient()
    .from("closings")
    .select("closing_date")
    .gte("closing_date", from)
    .lt("closing_date", today)
    .neq("status", "rejected");
  const have = new Set(((data ?? []) as { closing_date: string }[]).map((r) => r.closing_date));
  const missingDays: string[] = [];
  for (let d = addDays(today, -1); d >= from && missingDays.length < 8; d = addDays(d, -1)) {
    if (!have.has(d)) missingDays.push(d);
  }

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-7 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Link href="/home" className="flex min-h-11 items-center gap-1.5 text-[15px] text-strow-ink">
          <BackIcon />
          Home
        </Link>
        <p className="text-sm text-neutral-500">{session.name}</p>
      </header>
      <CloseFlow baristaName={session.name} initialDate={initialDate} missingDays={missingDays} />
    </main>
  );
}
