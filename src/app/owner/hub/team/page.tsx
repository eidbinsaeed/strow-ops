import { createServiceClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/locale";
import { TeamView } from "@/components/apple/TeamView";

export const dynamic = "force-dynamic";

export default async function TeamHubPage() {
  const locale = await getLocale();
  const { data } = await createServiceClient().from("baristas").select("id, name, is_on_shift").eq("is_active", true).order("name");
  const people = ((data ?? []) as { id: string; name: string; is_on_shift: boolean | null }[]).map((b) => ({ id: b.id, name: b.name, onShift: !!b.is_on_shift }));
  return <TeamView people={people} locale={locale} />;
}
