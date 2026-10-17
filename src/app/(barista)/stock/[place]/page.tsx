import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { shortDay, todayDubai } from "@/lib/dates";
import { groupItems, WEEKDAYS_EN, type Place, type WasteReason } from "@/lib/stock";
import { isFullCountDay } from "@/lib/waste";
import { StockCountForm, type CountItem } from "../StockCountForm";

export const dynamic = "force-dynamic";

type LineRow = { stock_item_id: string; qty: number | string; wasted: number | string | null; waste_reason: WasteReason | null };
type CountRow = { id: string; counted_on: string; counted_at: string; notes: string | null; baristas: { name: string } | { name: string }[] | null };

const nameOf = (b: CountRow["baristas"]) => (Array.isArray(b) ? b[0]?.name : b?.name) ?? null;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Dubai" });

export default async function StockCountPage({ params }: { params: Promise<{ place: string }> }) {
  const { place: raw } = await params;
  if (raw !== "shop" && raw !== "store") notFound();
  const place: Place = raw;
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const settings = await getSettings();
  const on = place === "shop" ? settings.staffShopCount : settings.staffStoreCount;
  const title = place === "shop" ? "Shop stock" : "Store room count";
  const today = todayDubai();
  // The store-room day is the full count: shop and store room, every item, for the waste check.
  const fullCount = isFullCountDay(today, settings.storeCountDay);

  const header = (
    <header className="flex items-center gap-3">
      <Link
        href="/home"
        aria-label="Back to home"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-300 bg-white text-strow-ink"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {fullCount ? "Full count day" : place === "shop" ? "Daily" : `Weekly, ${WEEKDAYS_EN[settings.storeCountDay]}s`} · {shortDay(today)}
        </p>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
      </div>
    </header>
  );

  if (!on) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
        {header}
        <p className="rounded-2xl bg-white p-4 text-sm text-neutral-600">The owner has not turned this on yet.</p>
      </main>
    );
  }

  const db = createServiceClient();
  const [itemsRes, todayRes, prevRes] = await Promise.all([
    db
      .from("stock_items")
      .select("id, name, unit_label, step, min_qty, grp, sort")
      .eq("location_id", session.lid)
      .eq("place", place)
      .eq("is_active", true)
      .order("sort"),
    db
      .from("stock_counts")
      .select("id, counted_on, counted_at, notes, baristas(name)")
      .eq("location_id", session.lid)
      .eq("place", place)
      .eq("counted_on", today)
      .order("counted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("stock_counts")
      .select("id, counted_on, counted_at, notes, baristas(name)")
      .eq("location_id", session.lid)
      .eq("place", place)
      .lt("counted_on", today)
      .order("counted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const todayCount = todayRes.data as CountRow | null;
  const prevCount = prevRes.data as CountRow | null;
  const ids = [todayCount?.id, prevCount?.id].filter(Boolean) as string[];
  const linesRes = ids.length
    ? await db.from("stock_count_lines").select("count_id, stock_item_id, qty, wasted, waste_reason").in("count_id", ids)
    : { data: [] };
  const lines = (linesRes.data ?? []) as (LineRow & { count_id: string })[];
  const prevQty = new Map(lines.filter((l) => l.count_id === prevCount?.id).map((l) => [l.stock_item_id, Number(l.qty)]));
  const todayLines = lines.filter((l) => l.count_id === todayCount?.id);

  const items: CountItem[] = ((itemsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    unit: String(r.unit_label),
    step: Number(r.step) || 1,
    min: r.min_qty === null ? null : Number(r.min_qty),
    grp: String(r.grp),
    sort: Number(r.sort) || 0,
    prev: prevQty.has(String(r.id)) ? (prevQty.get(String(r.id)) as number) : null,
  }));

  const yesterday = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) - 1)).toISOString().slice(0, 10);
  const prevLabel = !prevCount
    ? null
    : place === "shop" && prevCount.counted_on === yesterday
      ? "yesterday"
      : place === "store"
        ? "last count"
        : shortDay(prevCount.counted_on);
  const prevNote = prevCount
    ? `Last count: ${shortDay(prevCount.counted_on)}${nameOf(prevCount.baristas) ? ` by ${nameOf(prevCount.baristas)}` : ""}.`
    : "This is the first count.";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
      {header}
      {items.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-neutral-600">The list is empty. Ask the owner to add items.</p>
      ) : (
        <StockCountForm
          place={place}
          groups={groupItems(items)}
          prevLabel={prevLabel}
          fullCount={fullCount}
          intro={
            place === "shop"
              ? "Count what is in the shop right now: fridge, shelves and the bar. Not the store room. An open pack or bag counts as 0.5."
              : `Type what is on the shelves. An open pack counts as 0.5. ${prevNote} The grey number is the last count.`
          }
          initial={
            todayCount
              ? {
                  qty: Object.fromEntries(todayLines.map((l) => [l.stock_item_id, Number(l.qty)])),
                  waste: todayLines
                    .filter((l) => l.wasted !== null)
                    .map((l) => ({ id: l.stock_item_id, qty: Number(l.wasted), reason: l.waste_reason ?? "other" })),
                  notes: todayCount.notes ?? "",
                  savedLabel: `Saved at ${timeOf(todayCount.counted_at)}${nameOf(todayCount.baristas) ? ` by ${nameOf(todayCount.baristas)}` : ""}`,
                }
              : null
          }
        />
      )}
    </main>
  );
}
