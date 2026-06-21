import Link from "next/link";
import { OwnerNavLink } from "@/components/owner/OwnerNavLink";
import { OwnerLogoutButton } from "@/components/owner/OwnerLogoutButton";
import { tr } from "@/lib/i18n/tr";
import type { Locale } from "@/lib/i18n/dict";

/**
 * The nav content used by both the desktop sidebar and the mobile drawer.
 */
export function OwnerNavContent({
  signedIn,
  locale,
  badges,
}: {
  signedIn: boolean;
  locale: Locale;
  badges?: { pending_count: number; uncategorized_count: number; missing_float_count: number; missing_trn_count: number };
}) {
  return (
    <>
      <nav className="flex flex-col gap-3 px-3 pb-4 md:pb-6">
        <NavGroup label={tr("nav.group.operations", locale)}>
          <OwnerNavLink href="/owner">{tr("nav.dashboard", locale)}</OwnerNavLink>
          <OwnerNavLink href="/owner/review">
            {tr("nav.pending", locale) + (badges?.pending_count ? " (" + badges.pending_count + ")" : "")}
          </OwnerNavLink>
        </NavGroup>

        <NavGroup label={tr("nav.group.books", locale)}>
          <OwnerNavLink href="/owner/closings">
            {tr("nav.sales", locale) + (badges?.missing_float_count ? " (" + badges.missing_float_count + ")" : "")}
          </OwnerNavLink>
          <OwnerNavLink href="/owner/expenses">
            {tr("nav.purchases", locale) + (badges?.uncategorized_count ? " (" + badges.uncategorized_count + ")" : "")}
          </OwnerNavLink>
          <OwnerNavLink href="/owner/items">
            {tr("nav.items", locale)}
          </OwnerNavLink>
          <OwnerNavLink href="/owner/fixed-costs">
            {tr("nav.recurring", locale)}
          </OwnerNavLink>
          <OwnerNavLink href="/owner/liabilities">
            {tr("nav.liabilities", locale)}
          </OwnerNavLink>
        </NavGroup>

        <NavGroup label={tr("nav.group.setup", locale)}>
          <OwnerNavLink href="/owner/suppliers">
            {tr("nav.vendors", locale) + (badges?.missing_trn_count ? " (" + badges.missing_trn_count + ")" : "")}
          </OwnerNavLink>
          <OwnerNavLink href="/owner/categories">
            {tr("nav.coa", locale)}
          </OwnerNavLink>
          <OwnerNavLink href="/owner/baristas">
            {tr("nav.staff", locale)}
          </OwnerNavLink>
          <OwnerNavLink href="/owner/attendance">
            {tr("nav.attendance", locale)}
          </OwnerNavLink>
          <OwnerNavLink href="/owner/attendance/log">
            {tr("nav.attendance_log", locale)}
          </OwnerNavLink>
        </NavGroup>

        <NavGroup label={tr("nav.group.reporting", locale)}>
          <OwnerNavLink href="/owner/reports">
            {tr("nav.reports", locale)}
          </OwnerNavLink>
          <OwnerNavLink href="/owner/insights">
            {tr("nav.insights", locale)}
          </OwnerNavLink>
          <OwnerNavLink href="/owner/audit">
            {tr("nav.audit", locale)}
          </OwnerNavLink>
        </NavGroup>
        <NavGroup label={tr("nav.group.personal", locale)}>
          <OwnerNavLink href="/owner/finance">
            {tr("nav.finance", locale)}
          </OwnerNavLink>
        </NavGroup>
      </nav>

      <div className="border-t border-neutral-200 py-4">
        {signedIn ? (
          <OwnerLogoutButton locale={locale} />
        ) : (
          <Link
            href="/owner/login"
            className="mx-3 block rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
          >
            {tr("common.signin", locale)}
          </Link>
        )}
      </div>
    </>
  );
}

function NavGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
