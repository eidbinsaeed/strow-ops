import Link from "next/link";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";
import { OwnerNavContent } from "@/components/owner/OwnerNav";
import { MobileNavDrawer } from "@/components/owner/MobileNavDrawer";
import { LocaleProvider } from "@/components/owner/LocaleProvider";
import { LangToggle } from "@/components/owner/LangToggle";
import { getLocale, dirFor } from "@/lib/i18n/locale";
import { tr } from "@/lib/i18n/tr";
import { MobileTabBar } from "@/components/owner/MobileTabBar";
import { AiFab } from "@/components/ai/AiFab";
import { PageAiBar } from "@/components/ai/PageAiBar";

export const dynamic = "force-dynamic";

/**
 * Sidebar badge counts. Single cheap row from v_sidebar_badges.
 * Shape mirrors the view; OwnerNavContent only reads the four it badges,
 * the dashboard alerts panel uses open_liabilities_count too.
 */
type SidebarBadges = {
  pending_count: number;
  uncategorized_count: number;
  open_liabilities_count: number;
  missing_float_count: number;
  missing_trn_count: number;
};

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getOwnerSession();
  const signedIn = !!session;
  const locale = await getLocale();
  const dir = dirFor(locale);

  // Not signed in (e.g. /owner/login): render a bare page with NO sidebar,
  // so staff can't see the list of owner pages before authenticating.
  if (!signedIn) {
    return (
      <LocaleProvider locale={locale}>
        <div lang={locale} dir={dir} className="min-h-dvh">
          <main className="overflow-x-hidden">{children}</main>
        </div>
      </LocaleProvider>
    );
  }

  // One query feeds both the desktop sidebar and the mobile drawer nav.
  const supabase = createServiceClient();
  const { data: badgeRow } = await supabase
    .from("v_sidebar_badges")
    .select("*")
    .maybeSingle();
  const badges = (badgeRow as SidebarBadges | null) ?? undefined;
  const { count: aiOpenCount } = await supabase
    .from("ai_actions")
    .select("*", { count: "exact", head: true })
    .in("status", ["proposed", "info"]);
  const aiOpen = aiOpenCount ?? 0;

  return (
    <LocaleProvider locale={locale}>
      <div
        lang={locale}
        dir={dir}
        className="flex min-h-dvh flex-col md:flex-row"
      >
        {/* Mobile: top bar + drawer */}
        <MobileNavDrawer locale={locale}>
          <OwnerNavContent signedIn={signedIn} locale={locale} badges={badges} aiOpen={aiOpen} />
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
          <OwnerNavContent signedIn={signedIn} locale={locale} badges={badges} aiOpen={aiOpen} />
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden">
          <PageAiBar locale={locale} />
          {children}
        </main>
        <MobileTabBar locale={locale} aiBadge={aiOpen} />
        <AiFab />
      </div>
    </LocaleProvider>
  );
}
