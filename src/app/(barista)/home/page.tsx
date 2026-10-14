import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";
import { getSettings } from "@/lib/settings";
import { shortDay, todayDubai } from "@/lib/dates";
import { storeCountDue, WEEKDAYS_EN } from "@/lib/stock";

export const dynamic = "force-dynamic";

export default async function BaristaHomePage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const firstName = session.name.split(" ")[0];

  const supabase = createServiceClient();
  const today = todayDubai();
  const [{ data: meRow }, { data: notifs }, settings, { data: stockRows }] = await Promise.all([
    supabase.from("baristas").select("role, can_edit_stock_lists, can_edit_recipes").eq("id", session.bid).maybeSingle(),
    supabase
      .from("staff_reports")
      .select("id")
      .eq("barista_id", session.bid)
      .in("kind", ["warning", "incident"])
      .is("acknowledged_at", null),
    getSettings(),
    // Latest count of each list (shop / store), for the status under the buttons.
    supabase
      .from("stock_counts")
      .select("place, counted_on, counted_at")
      .eq("location_id", session.lid)
      .order("counted_at", { ascending: false })
      .limit(20),
  ]);
  const lastCount = (place: string) =>
    ((stockRows ?? []) as { place: string; counted_on: string; counted_at: string }[]).find((r) => r.place === place) ?? null;
  const lastShop = lastCount("shop");
  const shopDoneToday = lastShop?.counted_on === today;
  const storeDue = storeCountDue(lastCount("store")?.counted_on ?? null, today, settings.storeCountDay);
  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Dubai" });
  const me = meRow as { role?: string; can_edit_stock_lists?: boolean | null; can_edit_recipes?: boolean | null } | null;
  const role = (me?.role ?? "barista").toLowerCase();
  const canOperate = role !== "waiter";
  const stockOn = settings.staffShopCount || settings.staffStoreCount;
  const canEditLists = stockOn && me?.can_edit_stock_lists === true;
  const canEditRecipes = me?.can_edit_recipes === true;
  const notifCount = (notifs ?? []).length;

  return (
    <main className="flex min-h-dvh flex-col px-6 py-6">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            Logged in as
          </p>
          <p className="text-lg font-medium">{session.name}</p>
        </div>
        <LogoutButton />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 py-12">
        <p className="mb-2 text-center text-sm text-neutral-500">
          Hello, {firstName} 👋
        </p>

        {canOperate && (
          <>
            <Link
              href="/close"
              className="block rounded-2xl bg-strow-ink px-6 py-7 text-center text-lg font-medium text-white shadow-sm transition active:scale-[0.98]"
            >
              End of Day Close
              <span className="mt-1 block text-xs font-normal opacity-70">
                Photograph the closing sheet
              </span>
            </Link>

            <Link
              href="/expense"
              className="block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
            >
              Log Expense
              <span className="mt-1 block text-xs font-normal text-neutral-500">
                Photograph a receipt or invoice
              </span>
            </Link>

            <Link
              href={"/report-absence" as Route}
              className="block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
            >
              Report Absence
              <span className="mt-1 block text-xs font-normal text-neutral-500">
                Mark a waiter absent for a day
              </span>
            </Link>
          </>
        )}

        {settings.staffShopCount && (
          <Link
            href={"/stock/shop" as Route}
            className="relative block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
          >
            Shop stock
            <span className={`mt-1 block text-xs ${shopDoneToday ? "font-normal text-neutral-500" : "font-semibold text-strow-amber"}`}>
              {shopDoneToday && lastShop ? `Counted today at ${timeOf(lastShop.counted_at)} · tap to change` : "Daily · not counted yet today"}
            </span>
          </Link>
        )}

        {settings.staffStoreCount && (
          <Link
            href={"/stock/store" as Route}
            className="relative block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
          >
            Store room count
            <span className={`mt-1 block text-xs ${storeDue.state === "upcoming" ? "font-normal text-neutral-500" : "font-semibold text-strow-amber"}`}>
              {storeDue.state === "upcoming"
                ? `Weekly · next on ${shortDay(storeDue.due)}`
                : storeDue.state === "due"
                  ? "Due today"
                  : `Due since ${shortDay(storeDue.due)} · every ${WEEKDAYS_EN[settings.storeCountDay]}`}
            </span>
          </Link>
        )}

        {stockOn && (
          <div className={`grid gap-3 ${canEditLists ? "grid-cols-2" : "grid-cols-1"}`}>
            <Link
              href={"/stock/order" as Route}
              className="block rounded-2xl border border-neutral-300 bg-white px-4 py-5 text-center text-base font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
            >
              Order list
              <span className="mt-1 block text-xs font-normal text-neutral-500">What to bring or order · send on WhatsApp</span>
            </Link>
            {canEditLists && (
              <Link
                href={"/stock/lists" as Route}
                className="block rounded-2xl border border-neutral-300 bg-white px-4 py-5 text-center text-base font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
              >
                Count lists
                <span className="mt-1 block text-xs font-normal text-neutral-500">Items, units and minimums</span>
              </Link>
            )}
          </div>
        )}

        {canEditRecipes && (
          <Link
            href={"/recipes" as Route}
            className="block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
          >
            Recipes
            <span className="mt-1 block text-xs font-normal text-neutral-500">Ingredients, amounts and method for every item</span>
          </Link>
        )}

        <Link
          href={"/me/record" as Route}
          className="relative block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
        >
          {notifCount > 0 && (
            <span className="absolute right-4 top-4 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
              {notifCount}
            </span>
          )}
          My Record
          <span className="mt-1 block text-xs font-normal text-neutral-500">
            Attendance, warnings &amp; notifications
          </span>
        </Link>

        <Link
          href={"/me" as Route}
          className="block rounded-2xl border border-neutral-300 bg-white px-6 py-7 text-center text-lg font-medium text-strow-ink shadow-sm transition active:scale-[0.98]"
        >
          My Account
          <span className="mt-1 block text-xs font-normal text-neutral-500">
            Photo, phone &amp; password
          </span>
        </Link>
      </div>

      <footer className="text-center text-xs text-neutral-400">
        Strow Ops · v0.0.5
      </footer>
    </main>
  );
}
