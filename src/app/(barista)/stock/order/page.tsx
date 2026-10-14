import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { shortDay, todayDubai } from "@/lib/dates";
import { fmtQty, NO_SUPPLIER } from "@/lib/stock";
import { loadRestock } from "@/lib/stock-plan";
import { CopyText } from "@/components/stock/CopyText";
import { WhatsAppButton } from "@/components/stock/WhatsAppButton";

export const dynamic = "force-dynamic";

/**
 * The order list for staff: what to bring from the store room and what to
 * order, from the latest counts, with Send on WhatsApp. No prices here.
 */
export default async function StaffOrderListPage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");
  const settings = await getSettings();
  const today = todayDubai();

  const header = (
    <header className="flex items-center gap-3">
      <Link href="/home" aria-label="Back to home" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-300 bg-white text-strow-ink">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">From the latest counts · {shortDay(today)}</p>
        <h1 className="font-display text-2xl font-bold">Order list</h1>
      </div>
    </header>
  );

  if (!settings.staffShopCount && !settings.staffStoreCount) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
        {header}
        <p className="rounded-2xl bg-white p-4 text-sm text-neutral-600">The owner has not turned stock counts on yet.</p>
      </main>
    );
  }

  let restock: Awaited<ReturnType<typeof loadRestock>> | null = null;
  let error: string | null = null;
  try {
    restock = await loadRestock(session.lid, today);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const lastCounted = restock ? restock.levels.map((l) => l.counted_on).filter(Boolean).sort().pop() ?? null : null;
  const nothing = restock && !restock.plan.moves.length && !restock.plan.orders.length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
      {header}

      {error ? <p className="rounded-2xl bg-[#FBE9E7] p-4 text-sm text-[#9A1B12]">{error}</p> : null}

      {restock && !restock.counted ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-neutral-600">Nothing counted yet. Save a shop count or a store room count first.</p>
      ) : null}

      {nothing && restock?.counted ? (
        <section className="rounded-2xl border border-neutral-300 bg-white p-4">
          <p className="text-[15px] font-semibold">Nothing is below its minimum.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Last count {lastCounted ? shortDay(lastCounted) : "—"}. Count again and anything low shows up here.
          </p>
        </section>
      ) : null}

      {restock?.plan.moves.length ? (
        <section className="rounded-2xl border border-[#F1D9A8] bg-[#FFF7E8] p-4">
          <h2 className="text-[15px] font-semibold">Bring from the store room</h2>
          {restock.plan.moves.map((m) => (
            <div key={m.item.id} className="mt-2 flex justify-between gap-3 border-t border-[#F1D9A8]/60 pt-2 text-sm">
              <span>
                {m.item.name}
                <span className="block text-xs text-neutral-500">
                  shop {fmtQty(m.item.qty ?? 0)}, minimum {fmtQty(m.item.min_qty ?? 0)}
                  {m.from.some((f) => f.qty !== null) ? ` · store has ${m.from.filter((f) => f.qty !== null).map((f) => `${fmtQty(f.qty ?? 0)} ${f.unit}`).join(", ")}` : " · store room not counted"}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {fmtQty(m.bring)} {m.item.unit_label}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {restock?.plan.orders.map((g) => (
        <section key={g.supplier} className="rounded-2xl border border-neutral-300 bg-white p-4">
          <h2 className={`text-[15px] font-semibold ${g.supplier === NO_SUPPLIER ? "text-neutral-500" : ""}`}>
            {g.supplier === NO_SUPPLIER ? "No usual supplier" : `Order · ${g.supplier}`}
          </h2>
          {g.lines.map((l) => (
            <div key={l.item.id} className="mt-2 flex justify-between gap-3 border-t border-[#EEF1F4] pt-2 text-sm">
              <span>
                {l.item.name}
                <span className="block text-xs text-strow-amber">{l.why}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {fmtQty(l.qty)} {l.item.unit_label}
              </span>
            </div>
          ))}
        </section>
      ))}

      {restock && (restock.plan.moves.length || restock.plan.orders.length) ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <WhatsAppButton text={restock.message} label="Send on WhatsApp" />
            <CopyText text={restock.message} label="Copy list" done="Copied ✓" />
          </div>
          <p className="text-center text-xs text-neutral-500">WhatsApp opens with the list ready — pick the supplier or the team group and send.</p>
        </>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-3">
        {settings.staffShopCount ? (
          <Link href={"/stock/shop" as Route} className="flex min-h-12 items-center justify-center rounded-2xl border border-neutral-300 bg-white px-3 text-center text-[14px] font-semibold text-strow-ink">
            Shop count
          </Link>
        ) : null}
        {settings.staffStoreCount ? (
          <Link href={"/stock/store" as Route} className="flex min-h-12 items-center justify-center rounded-2xl border border-neutral-300 bg-white px-3 text-center text-[14px] font-semibold text-strow-ink">
            Store room count
          </Link>
        ) : null}
      </div>
    </main>
  );
}
