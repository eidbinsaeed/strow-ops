import { redirect } from "next/navigation";
import Link from "next/link";
import { getBaristaSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { signedStaffPhotoUrl } from "@/lib/storage/staff-photo";
import { MyAccountForm } from "./MyAccountForm";

export const dynamic = "force-dynamic";

type MeRow = {
  name?: string;
  role?: string;
  employee_code?: string | null;
  phone?: string | null;
  photo_url?: string | null;
};

export default async function MyAccountPage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("baristas")
    .select("name, role, employee_code, phone, photo_url")
    .eq("id", session.bid)
    .maybeSingle();
  const me = (data ?? {}) as MeRow;
  const photoUrl = await signedStaffPhotoUrl(me.photo_url);

  return (
    <main className="flex min-h-dvh flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Link href="/home" className="text-sm text-neutral-500">
          ‹ Home
        </Link>
        <p className="text-sm font-medium">My Account</p>
        <span className="w-12" />
      </header>

      <div className="mx-auto w-full max-w-md py-8">
        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <div className="text-lg font-medium">{me.name}</div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            ID {me.employee_code ?? "—"} · {me.role}
          </div>
        </div>
        <MyAccountForm phone={me.phone ?? ""} photoUrl={photoUrl} />
      </div>
    </main>
  );
}
