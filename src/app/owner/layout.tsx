import Link from "next/link";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { OwnerNavContent } from "@/components/owner/OwnerNav";
import { MobileNavDrawer } from "@/components/owner/MobileNavDrawer";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getOwnerSession();
  const signedIn = !!session;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Mobile: top bar + drawer */}
      <MobileNavDrawer>
        <OwnerNavContent signedIn={signedIn} />
      </MobileNavDrawer>

      {/* Desktop: persistent sidebar */}
      <aside className="hidden border-r border-neutral-200 bg-white md:flex md:w-64 md:flex-shrink-0 md:flex-col">
        <div className="px-6 py-5">
          <Link href="/owner" className="text-lg font-medium">
            Strow Ops
          </Link>
          <p className="text-xs text-neutral-500">Owner</p>
        </div>
        <OwnerNavContent signedIn={signedIn} />
      </aside>

      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
