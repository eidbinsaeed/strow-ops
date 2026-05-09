import Link from "next/link";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { OwnerNavContent } from "@/components/owner/OwnerNav";
import { MobileNavDrawer } from "@/components/owner/MobileNavDrawer";
import { LocaleProvider } from "@/components/owner/LocaleProvider";
import { LangToggle } from "@/components/owner/LangToggle";
import { getLocale, dirFor } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getOwnerSession();
  const signedIn = !!session;
  const locale = await getLocale();
  const dir = dirFor(locale);

  return (
    <LocaleProvider locale={locale}>
      <div
        lang={locale}
        dir={dir}
        className="flex min-h-dvh flex-col md:flex-row"
      >
        {/* Mobile: top bar + drawer */}
        <MobileNavDrawer locale={locale}>
          <OwnerNavContent signedIn={signedIn} locale={locale} />
        </MobileNavDrawer>

        {/* Desktop: persistent sidebar */}
        <aside className="hidden border-neutral-200 bg-white md:flex md:w-64 md:flex-shrink-0 md:flex-col md:border-e">
          <div className="flex items-center justify-between px-6 py-5">
            <Link href="/owner" className="text-lg font-medium">
              {tr("brand.title", locale)}
            </Link>
            <LangToggle />
          </div>
          <p className="-mt-3 px-6 pb-3 text-xs text-neutral-500">
            {tr("brand.role", locale)}
          </p>
          <OwnerNavContent signedIn={signedIn} locale={locale} />
        </aside>

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </LocaleProvider>
  );
}
