import { getLocale } from "@/lib/i18n/locale";
import { todayDubai } from "@/lib/dates";
import { loadVatReturn, MONTHS, quartersSince } from "@/lib/reports/vat";
import { VatView } from "@/components/owner/vat/VatView";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dayLong = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export default async function VatReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ar = (await getLocale()) === "ar";
  const today = todayDubai();
  const quarters = quartersSince("2026-05-01", today);
  const custom = DATE.test(sp.from ?? "") && DATE.test(sp.to ?? "") && (sp.from as string) <= (sp.to as string);
  const picked = quarters.find((q) => q.key === sp.q) ?? quarters.find((q) => q.done) ?? quarters[0];
  const from = custom ? (sp.from as string) : picked.from;
  const to = custom ? (sp.to as string) : picked.to;
  const label = custom ? `${dayLong(from)} – ${dayLong(to)}` : picked.label;
  const v = await loadVatReturn(from, to, today);
  return <VatView v={v} ar={ar} label={label} quarters={quarters} picked={picked} custom={custom} from={from} to={to} />;
}
