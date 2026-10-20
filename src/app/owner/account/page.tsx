import { getLocale } from "@/lib/i18n/locale";
import { AccountView } from "@/components/apple/AccountView";

export default async function AccountPage() {
  const locale = await getLocale();
  return (
    <div className="page">
      <AccountView locale={locale} />
    </div>
  );
}
