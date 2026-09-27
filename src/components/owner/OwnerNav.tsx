import Link from "next/link";
import { OwnerNavLink } from "@/components/owner/OwnerNavLink";
import { OwnerLogoutButton } from "@/components/owner/OwnerLogoutButton";
import { tr } from "@/lib/i18n/tr";
import { PushToggle } from "@/components/push/PushToggle";
import type { Locale } from "@/lib/i18n/dict";

/** Navigation shared by the desktop sidebar and the phone menu (Pulse layout). */
export function OwnerNavContent({
  signedIn,
  locale,
  badges,
  aiOpen = 0,
}: {
  signedIn: boolean;
  locale: Locale;
  aiOpen?: number;
  badges?: { pending_count: number; uncategorized_count: number; missing_float_count: number; missing_trn_count: number };
}) {
  const ar = locale === "ar";
  return (
    <>
      <nav className="flex flex-col gap-4 px-3 pb-4 md:pb-6">
        <div className="flex flex-col gap-0.5">
          <OwnerNavLink href="/owner">{ar ? "النبض" : "Pulse"}</OwnerNavLink>
          <OwnerNavLink href="/owner/needs-you" badge={aiOpen}>{ar ? "يحتاجك" : "Needs you"}</OwnerNavLink>
          <OwnerNavLink href="/owner/assistant">{ar ? "✦ اسأل Strow AI" : "✦ Ask Strow AI"}</OwnerNavLink>
          <OwnerNavLink href="/owner/closings" badge={badges?.missing_float_count}>{tr("nav.sales", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/expenses" badge={badges?.uncategorized_count}>{tr("nav.purchases", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/items">{tr("nav.items", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/baristas">{tr("nav.staff", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/reports">{tr("nav.reports", locale)}</OwnerNavLink>
        </div>
        <NavGroup label={ar ? "المزيد" : "More"}>
          <OwnerNavLink href="/owner/review" badge={badges?.pending_count}>{tr("nav.pending", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/fixed-costs">{tr("nav.recurring", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/liabilities">{tr("nav.liabilities", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/suppliers" badge={badges?.missing_trn_count}>{tr("nav.vendors", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/categories">{tr("nav.coa", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/attendance">{tr("nav.attendance", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/attendance/log">{tr("nav.attendance_log", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/attendance/reports">{tr("nav.attendance_reports", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/insights">{tr("nav.insights", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/audit">{tr("nav.audit", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/finance">{tr("nav.finance", locale)}</OwnerNavLink>
        </NavGroup>
      </nav>

      {signedIn ? <PushToggle variant="row" locale={locale} /> : null}
      <div className="px-0 py-3">
        {signedIn ? (
          <OwnerLogoutButton locale={locale} />
        ) : (
          <Link href="/owner/login" className="mx-3 block rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100">
            {tr("common.signin", locale)}
          </Link>
        )}
      </div>
    </>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
