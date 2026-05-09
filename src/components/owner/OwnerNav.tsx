import Link from "next/link";
import { OwnerNavLink } from "@/components/owner/OwnerNavLink";
import { OwnerLogoutButton } from "@/components/owner/OwnerLogoutButton";

/**
 * The nav content used by both the desktop sidebar and the mobile drawer.
 * Pure server JSX. The mobile drawer attaches its own onClickCapture handler
 * to the wrapping div so it auto-closes when any link is tapped.
 */
export function OwnerNavContent({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <nav className="flex flex-col gap-3 px-3 pb-4 md:pb-6">
        <NavGroup label="Operations">
          <OwnerNavLink href="/owner">Dashboard</OwnerNavLink>
          <OwnerNavLink href="/owner/review">Pending Approval</OwnerNavLink>
        </NavGroup>

        <NavGroup label="Books">
          <OwnerNavLink href="/owner/closings">Sales</OwnerNavLink>
          <OwnerNavLink href="/owner/expenses">Purchases</OwnerNavLink>
          <OwnerNavLink href="/owner/fixed-costs">Recurring Costs</OwnerNavLink>
          <OwnerNavLink href="/owner/liabilities">Liabilities</OwnerNavLink>
        </NavGroup>

        <NavGroup label="Setup">
          <OwnerNavLink href="/owner/suppliers">Vendors</OwnerNavLink>
          <OwnerNavLink href="/owner/categories">Chart of Accounts</OwnerNavLink>
          <OwnerNavLink href="/owner/baristas">Staff</OwnerNavLink>
        </NavGroup>

        <NavGroup label="Reporting">
          <OwnerNavLink href="/owner/reports">Reports</OwnerNavLink>
          <OwnerNavLink href="/owner/audit">Audit Trail</OwnerNavLink>
        </NavGroup>
      </nav>

      <div className="border-t border-neutral-200 py-4">
        {signedIn ? (
          <OwnerLogoutButton />
        ) : (
          <Link
            href="/owner/login"
            className="mx-3 block rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
          >
            Sign in
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
