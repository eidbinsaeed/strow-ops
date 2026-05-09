import Link from "next/link";
import { OwnerNavLink } from "@/components/owner/OwnerNavLink";
import { OwnerLogoutButton } from "@/components/owner/OwnerLogoutButton";
import { getOwnerSession } from "@/lib/auth/owner-session";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getOwnerSession();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b border-neutral-200 bg-white md:w-64 md:flex-shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-6 py-5 md:block">
          <div>
            <Link href="/owner" className="text-lg font-medium">
              Strow Ops
            </Link>
            <p className="text-xs text-neutral-500">Owner</p>
          </div>
          {!session && (
            <Link
              href="/owner/login"
              className="text-xs text-neutral-500 hover:text-strow-ink md:hidden"
            >
              Sign in
            </Link>
          )}
        </div>

        <nav className="flex flex-wrap gap-1 px-3 pb-4 md:flex-col md:gap-0.5 md:pb-6">
          <OwnerNavLink href="/owner">Dashboard</OwnerNavLink>
          <OwnerNavLink href="/owner/review">Review queue</OwnerNavLink>
          <OwnerNavLink href="/owner/closings">Daily Sales</OwnerNavLink>
          <OwnerNavLink href="/owner/expenses">Expenses</OwnerNavLink>
          <OwnerNavLink href="/owner/suppliers">Suppliers</OwnerNavLink>
          <OwnerNavLink href="/owner/categories">Categories</OwnerNavLink>
          <OwnerNavLink href="/owner/baristas">Baristas</OwnerNavLink>
          <OwnerNavLink href="/owner/fixed-costs">Fixed Costs</OwnerNavLink>
          <OwnerNavLink href="/owner/liabilities">Liabilities</OwnerNavLink>
          <OwnerNavLink href="/owner/reports">Reports</OwnerNavLink>
          <OwnerNavLink href="/owner/audit">Audit log</OwnerNavLink>
        </nav>

        <div className="hidden border-t border-neutral-200 py-4 md:block">
          {session ? (
            <OwnerLogoutButton email={session.email} />
          ) : (
            <Link
              href="/owner/login"
              className="mx-3 block rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
            >
              Sign in
            </Link>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
