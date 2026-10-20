"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PushToggle } from "@/components/push/PushToggle";
import type { Locale } from "@/lib/i18n/dict";
import { COLOR } from "@/lib/sections";
import { Group, LargeTitle, Row, RowIcon, Rows } from "./ui";

function LanguageRow({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const ar = locale === "ar";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch("/api/lang", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: ar ? "en" : "ar" }) });
          router.refresh();
        })
      }
      className="apple-row flex w-full items-center gap-3 ps-4 text-start active:bg-neutral-100 disabled:opacity-60"
    >
      <RowIcon name="globe" color={COLOR.blue} />
      <span className="apple-row-body flex min-h-[52px] flex-1 items-center gap-2 pe-3.5">
        <span className="flex-1 text-[17px]">{ar ? "اللغة" : "Language"}</span>
        <span className="text-[15px] text-neutral-500">{pending ? "…" : ar ? "العربية · English" : "English · العربية"}</span>
      </span>
    </button>
  );
}

/** Account: Eid's own pages, admin, notifications, language and sign out. */
export function AccountView({ locale, name = "Eid" }: { locale: Locale; name?: string }) {
  const ar = locale === "ar";
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      <LargeTitle title={ar ? "الحساب" : "Account"} />
      <div className="flex items-center gap-3.5 rounded-3xl bg-white px-4 py-3.5">
        <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-strow-blue text-[22px] font-semibold text-white">{name.charAt(0)}</span>
        <span className="flex flex-col gap-0.5">
          <span className="text-[20px] font-bold">{name}</span>
          <span className="text-[15px] text-neutral-500">{ar ? "المالك · قهوة قاڤي، العين" : "Owner · Qave Cafe, Al Ain"}</span>
        </span>
      </div>
      <Group title={ar ? "أنت" : "You"}>
        <Rows>
          <Row href="/owner/finance" icon="wallet" color={COLOR.green} label={ar ? "المالية الشخصية" : "Personal finance"} />
        </Rows>
      </Group>
      <Group title={ar ? "الإدارة" : "Admin"}>
        <Rows>
          <Row href="/owner/categories" icon="tree" color={COLOR.grey} label={ar ? "دليل الحسابات" : "Chart of accounts"} />
          <Row href="/owner/assistant/activity" icon="sparkle" color={COLOR.grey} label={ar ? "نشاط الذكاء الاصطناعي" : "Strow AI activity"} />
          <Row href="/owner/audit" icon="shield" color={COLOR.grey} label={ar ? "سجل التدقيق" : "Audit trail"} />
        </Rows>
      </Group>
      <Group title={ar ? "الإعدادات" : "Settings"}>
        <div className="-mx-3">
          <PushToggle variant="row" locale={locale} />
        </div>
        <Rows>
          <LanguageRow locale={locale} />
        </Rows>
      </Group>
      <form action="/api/auth/owner-logout" method="POST" className="overflow-hidden rounded-3xl bg-white">
        <button type="submit" className="min-h-[52px] w-full text-[17px] font-semibold text-[#E9152D] active:bg-neutral-100">
          {ar ? "تسجيل الخروج" : "Sign out"}
        </button>
      </form>
    </div>
  );
}
