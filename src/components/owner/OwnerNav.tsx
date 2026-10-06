import Link from "next/link";
import { OwnerNavLink } from "@/components/owner/OwnerNavLink";
import { OwnerLogoutButton } from "@/components/owner/OwnerLogoutButton";
import { tr } from "@/lib/i18n/tr";
import { PushToggle } from "@/components/push/PushToggle";
import type { Locale } from "@/lib/i18n/dict";

/**
 * Navigation shared by the desktop sidebar and the phone menu, grouped the way the café runs:
 * Sales · Menu · Purchases · Team · Reports · Admin. Each page has one name everywhere.
 */
export function OwnerNavContent({
  signedIn,
  locale,
  badges,
  aiOpen = 0,
}: {
  signedIn: boolean;
  locale: Locale;
  aiOpen?: number;
  badges?: { pending_count: number; uncategorized_count: number; missing_float_count: number; missing_trn_count: number };
}) {
  const ar = locale === "ar";
  return (
    <>
      <nav className="flex flex-col gap-4 px-3 pb-4 md:pb-6">
        <div className="flex flex-col gap-0.5">
          <OwnerNavLink href="/owner">{ar ? "النبض" : "Pulse"}</OwnerNavLink>
          <OwnerNavLink href="/owner/needs-you" badge={aiOpen}>{ar ? "يحتاجك" : "Needs you"}</OwnerNavLink>
          <OwnerNavLink href="/owner/review" badge={badges?.pending_count}>{ar ? "الموافقات" : "Approvals"}</OwnerNavLink>
          <OwnerNavLink href="/owner/assistant" exact>{ar ? "✦ Strow AI" : "✦ Strow AI"}</OwnerNavLink>
        </div>

        <NavGroup label={ar ? "المبيعات" : "Sales"}>
          <OwnerNavLink href="/owner/sales" also={["/owner/insights"]}>{ar ? "نظرة عامة" : "Overview"}</OwnerNavLink>
          <OwnerNavLink href="/owner/orders">{ar ? "الطلبات" : "Orders"}</OwnerNavLink>
          <OwnerNavLink href="/owner/closings" badge={badges?.missing_float_count}>{ar ? "الإقفالات" : "Closings"}</OwnerNavLink>
          <OwnerNavLink href="/owner/pos-reports">{ar ? "تقارير نقاط البيع" : "POS reports"}</OwnerNavLink>
        </NavGroup>

        <NavGroup label={ar ? "القائمة" : "Menu"}>
          <OwnerNavLink href="/owner/recipes">{ar ? "الوصفات" : "Recipes"}</OwnerNavLink>
        </NavGroup>

        <NavGroup label={ar ? "المشتريات" : "Purchases"}>
          <OwnerNavLink href="/owner/expenses" badge={badges?.uncategorized_count}>{ar ? "الفواتير" : "Bills"}</OwnerNavLink>
          <OwnerNavLink href="/owner/items">{ar ? "الأصناف" : "Items"}</OwnerNavLink>
          <OwnerNavLink href="/owner/suppliers" badge={badges?.missing_trn_count}>{ar ? "الموردون" : "Vendors"}</OwnerNavLink>
          <OwnerNavLink href="/owner/fixed-costs">{ar ? "المصاريف الثابتة" : "Recurring costs"}</OwnerNavLink>
        </NavGroup>

        <NavGroup label={ar ? "الفريق" : "Team"}>
          <OwnerNavLink href="/owner/baristas">{ar ? "الموظفون" : "Staff"}</OwnerNavLink>
          <OwnerNavLink href="/owner/attendance" exact also={["/owner/attendance/log"]}>{ar ? "الحضور" : "Attendance"}</OwnerNavLink>
          <OwnerNavLink href="/owner/attendance/reports">{ar ? "سجلات الموظفين" : "Staff records"}</OwnerNavLink>
        </NavGroup>

        <NavGroup label={ar ? "التقارير" : "Reports"}>
          <OwnerNavLink href="/owner/reports" exact also={["/owner/reports/monthly-pnl"]}>{ar ? "الأرباح والخسائر" : "Profit & loss"}</OwnerNavLink>
          <OwnerNavLink href="/owner/reports/category-breakdown">{ar ? "الإنفاق حسب الفئة" : "Spending by category"}</OwnerNavLink>
          <OwnerNavLink href="/owner/reports/vat">{ar ? "ضريبة القيمة المضافة" : "VAT"}</OwnerNavLink>
          <OwnerNavLink href="/owner/liabilities">{ar ? "المبالغ المستحقة" : "Money owed"}</OwnerNavLink>
        </NavGroup>

        <NavGroup label={ar ? "الإدارة" : "Admin"}>
          <OwnerNavLink href="/owner/categories">{ar ? "دليل الحسابات" : "Chart of accounts"}</OwnerNavLink>
          <OwnerNavLink href="/owner/assistant/activity">{ar ? "نشاط الذكاء الاصطناعي" : "AI activity"}</OwnerNavLink>
          <OwnerNavLink href="/owner/audit">{ar ? "سجل التدقيق" : "Audit trail"}</OwnerNavLink>
          <OwnerNavLink href="/owner/finance">{ar ? "المالية الشخصية" : "Personal finance"}</OwnerNavLink>
        </NavGroup>
      </nav>

      {signedIn ? <PushToggle variant="row" locale={locale} /> : null}
      <div className="px-0 py-3">
        {signedIn ? (
          <OwnerLogoutButton locale={locale} />
        ) : (
          <Link href="/owner/login" className="mx-3 block rounded-md px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100">
            {tr("common.signin", locale)}
          </Link>
        )}
      </div>
    </>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
