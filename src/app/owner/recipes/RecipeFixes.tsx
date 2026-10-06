"use client";

import { useState, useTransition } from "react";
import { useLocale } from "@/components/owner/LocaleProvider";
import { ItemSelect } from "./RecipeIntake";
import { convertPieces, linkLabelToItem, setManualPrice, setPackSize, switchUnit } from "./actions";
import { rt, type CostIssue, type ItemOption } from "@/lib/recipes";

const field = "rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-[15px] focus:border-strow-ink focus:outline-none";
const btn = "shrink-0 rounded-full bg-strow-ink px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50";

/** The "Finish the costs" list: each ingredient that blocks a cost, with its one fix. */
export function CostFixes({ issues, items, compact = false }: { issues: CostIssue[]; items: ItemOption[]; compact?: boolean }) {
  const locale = useLocale();
  if (!issues.length) return null;
  return (
    <section className={compact ? "flex flex-col gap-2" : "rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]"}>
      {!compact ? (
        <div className="mb-3">
          <h2 className="font-display text-lg font-semibold">
            {rt("fix_prices", locale)} <span className="text-neutral-400">· {issues.length}</span>
          </h2>
          <p className="text-xs text-neutral-500">{rt("fix_hint", locale)}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {issues.map((i) => (
          <IssueCard key={i.key} issue={i} items={items} showUsedIn={!compact} />
        ))}
      </div>
    </section>
  );
}

function IssueCard({ issue, items, showUsedIn }: { issue: CostIssue; items: ItemOption[]; showUsedIn: boolean }) {
  const locale = useLocale();
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>) => (fd: FormData) => {
    setError(null);
    start(async () => {
      const res = await fn(fd);
      if (res && "error" in res && res.error) setError(res.error);
    });
  };
  const title = issue.kind === "no_item" ? issue.label : issue.name;

  return (
    <div className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-3.5">
      <p className="text-[15px] font-semibold">{title}</p>
      {showUsedIn && issue.usedIn.length ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
          {t("used_in")}: {issue.usedIn.join(", ")}
        </p>
      ) : null}

      {issue.kind === "pack" && (
        <form action={run(setPackSize)} className="mt-2.5">
          <p className="mb-1.5 text-sm text-neutral-700">{t("pack_q")}</p>
          <input type="hidden" name="inventory_item_id" value={issue.itemId} />
          <div className="flex items-center gap-2">
            <input name="size" inputMode="decimal" required defaultValue={issue.guess?.size ?? ""} placeholder="3.2" className={`${field} w-24`} />
            <select name="uom" defaultValue={issue.guess?.uom ?? "kg"} className={`${field} w-20`}>
              {["g", "kg", "ml", "L"].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button disabled={pending} className={btn}>
              {t("set")}
            </button>
          </div>
        </form>
      )}

      {issue.kind === "per_piece" && (
        <form action={run(convertPieces)} className="mt-2.5">
          <p className="mb-1.5 text-sm text-neutral-700">
            {t("per_piece_q")} {issue.costBase}. {t("per_piece_q2")}:
          </p>
          <input type="hidden" name="inventory_item_id" value={issue.itemId} />
          <input type="hidden" name="uom" value={issue.costBase === "kg" ? "g" : "ml"} />
          <div className="flex items-center gap-2">
            <input name="per_piece" inputMode="decimal" required placeholder="120" className={`${field} w-24`} />
            <span className="text-sm text-neutral-600">{issue.costBase === "kg" ? "g" : "ml"}</span>
            <button disabled={pending} className={btn}>
              {t("set")}
            </button>
          </div>
        </form>
      )}

      {issue.kind === "swap" && (
        <form action={run(switchUnit)} className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <input type="hidden" name="inventory_item_id" value={issue.itemId} />
          <input type="hidden" name="to" value={issue.costBase} />
          <p className="text-sm text-neutral-700">
            {t("swap_q")} {issue.costBase} (1 ml ≈ 1 g)
          </p>
          <button disabled={pending} className={btn}>
            {t("swap_btn")} {issue.costBase === "kg" ? "g" : "ml"}
          </button>
        </form>
      )}

      {issue.kind === "no_price" &&
        issue.bases.map((b) => (
          <form key={b} action={run(setManualPrice)} className="mt-2.5">
            <p className="mb-1.5 text-sm text-neutral-700">
              {t("no_price_q")} {b}:
            </p>
            <input type="hidden" name="inventory_item_id" value={issue.itemId} />
            <input type="hidden" name="base" value={b} />
            <div className="flex items-center gap-2">
              <input name="cost" inputMode="decimal" required placeholder="AED" className={`${field} w-28`} />
              <button disabled={pending} className={btn}>
                {t("set")}
              </button>
            </div>
          </form>
        ))}

      {issue.kind === "no_item" && <NoItemFix issue={issue} items={items} pending={pending} run={run} />}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function NoItemFix({
  issue,
  items,
  pending,
  run,
}: {
  issue: Extract<CostIssue, { kind: "no_item" }>;
  items: ItemOption[];
  pending: boolean;
  run: (fn: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>) => (fd: FormData) => void;
}) {
  const locale = useLocale();
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const [itemId, setItemId] = useState("");
  return (
    <>
      <p className="mt-2 text-sm text-neutral-700">{t("no_item_q")}</p>
      <form action={run(linkLabelToItem)} className="mt-1.5 flex items-center gap-2">
        <input type="hidden" name="label" value={issue.label} />
        <input type="hidden" name="inventory_item_id" value={itemId} />
        <ItemSelect items={items} value={itemId} onChange={setItemId} className={`${field} min-w-0 flex-1`} />
        <button disabled={pending || !itemId} className={btn}>
          {t("link_to")}
        </button>
      </form>
      {issue.bases.map((b) => (
        <form key={b} action={run(setManualPrice)} className="mt-2 flex items-center gap-2">
          <input type="hidden" name="label" value={issue.label} />
          <input type="hidden" name="base" value={b} />
          <span className="text-sm text-neutral-600">
            {t("or_price")} {b}
          </span>
          <input name="cost" inputMode="decimal" required placeholder="AED" className={`${field} w-24`} />
          <button disabled={pending} className={btn}>
            {t("set")}
          </button>
        </form>
      ))}
    </>
  );
}
