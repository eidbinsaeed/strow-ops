import Link from "next/link";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";
import { OwnerNavContent } from "@/components/owner/OwnerNav";
import { MobileNavDrawer } from "@/components/owner/MobileNavDrawer";
import { LocaleProvider } from "@/components/owner/LocaleProvider";
import { LangToggle } from "@/components/owner/LangToggle";
import { getLocale, dirFor } from "@/lib/i18n/locale";
import { MobileTabBar } from "@/components/owner/MobileTabBar";
import { AiFab } from "@/components/ai/AiFab";
import { PageAiBar } from "@/components/ai/PageAiBar";
import { ThemeScope } from "@/components/pulse/ThemeScope";

export const dynamic = "force-dynamic";

/** Sidebar badge counts. Single cheap row from v_sidebar_badges. */
type SidebarBadges = {
  pending_count: number;
  uncategorized_count: number;
  open_liabilities_count: number;
  missing_float_count: number;
  missing_trn_count: number;
};

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const session = await getOwnerSession();
  const signedIn = !!session;
  const locale = await getLocale();
  const dir = dirFor(locale);

  // Not signed in (e.g. /owner/login): bare page, no navigation.
  if (!signedIn) {
    return (
      <LocaleProvider locale={locale}>
        <ThemeScope lang={locale} dir={dir} className="min-h-dvh">
          <main className="overflow-x-hidden">{children}</main>
        </ThemeScope>
      </LocaleProvider>
    );
  }

  const supabase = createServiceClient();
  const [{ data: badgeRow }, { count: aiOpenCount }] = await Promise.all([
    supabase.from("v_sidebar_badges").select("*").maybeSingle(),
    supabase.from("ai_actions").select("*", { count: "exact", head: true }).in("status", ["proposed", "info"]),
  ]);
  const badges = (badgeRow as SidebarBadges | null) ?? undefined;
  const aiOpen = aiOpenCount ?? 0;

  return (
    <LocaleProvider locale={locale}>
      <ThemeScope lang={locale} dir={dir} className="flex min-h-dvh flex-col md:flex-row">
        {/* Phone: header + slide-out menu */}
        <MobileNavDrawer locale={locale}>
          <OwnerNavContent signedIn={signedIn} locale={locale} badges={badges} aiOpen={aiOpen} />
        </MobileNavDrawer>

        {/* Desktop: sidebar */}
        <aside className="hidden print:hidden md:sticky md:top-0 md:flex md:h-dvh md:w-[248px] md:flex-shrink-0 md:flex-col md:overflow-y-auto md:py-7">
          <div className="flex items-center justify-between px-6 pb-5">
            <Link href="/owner" className="font-display text-2xl font-bold tracking-[-0.5px]">
              Strow
            </Link>
            <LangToggle />
          </div>
          <OwnerNavContent signedIn={signedIn} locale={locale} badges={badges} aiOpen={aiOpen} />
          <div className="mx-4 mt-auto rounded-[18px] bg-white px-3 py-3.5">
            <p className="text-sm font-semibold">Qave Cafe, Main</p>
            <p className="text-xs text-neutral-500">Al Ain</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden">
          <PageAiBar locale={locale} />
          {children}
        </main>
        <MobileTabBar locale={locale} aiBadge={aiOpen} />
        <AiFab />
      </ThemeScope>
    </LocaleProvider>
  );
}
