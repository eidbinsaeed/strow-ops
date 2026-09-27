import { after } from "next/server";
import { loadFinance } from "@/lib/finance/load";
import { backupFinance } from "@/lib/finance/backup";
import { FinancePulse } from "@/components/finance/FinancePulse";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FinancePage() {
  const initial = await loadFinance();
  // Today's safety copy of all finance records exists before anything can change.
  after(() => backupFinance("daily"));
  return (
    <div className="page" dir="rtl">
      <FinancePulse initial={initial} />
    </div>
  );
}
