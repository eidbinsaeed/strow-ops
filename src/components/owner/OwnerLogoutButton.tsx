"use client";

import { tr } from "@/lib/i18n/tr";
import type { Locale } from "@/lib/i18n/dict";

export function OwnerLogoutButton({ locale }: { locale: Locale }) {
  return (
    <form
      action="/api/auth/owner-logout"
      method="POST"
      className="block w-full"
    >
      <div className="px-3 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">
        {tr("common.signedin", locale)}
      </div>
      <button
        type="submit"
        className="block w-full rounded-md px-3 py-2 text-start text-sm text-neutral-500 hover:bg-neutral-100"
      >
        {tr("common.signout", locale)}
      </button>
    </form>
  );
}
