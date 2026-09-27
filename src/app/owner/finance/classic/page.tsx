import Link from "next/link";
import { FinanceApp } from "@/components/owner/FinanceApp";
import { loadFinance } from "@/lib/finance/load";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The original personal finance page, unchanged — kept as a fallback.
export default async function FinanceClassicPage() {
  const initial = await loadFinance();
  return (
    <div className="px-4 py-6 md:px-8" dir="rtl">
      <FinanceApp initial={initial} />
      <p className="mt-6 text-xs text-neutral-400">
        <Link href="/owner/finance" className="underline hover:text-strow-ink">→ الصفحة الجديدة</Link>
      </p>
    </div>
  );
}
