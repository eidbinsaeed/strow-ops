import Link from "next/link";
import { redirect } from "next/navigation";
import { getBaristaSession } from "@/lib/auth/session";
import { CloseFlow } from "./CloseFlow";

export const dynamic = "force-dynamic";

export default async function ClosePage() {
  const session = await getBaristaSession();
  if (!session) redirect("/login");

  return (
    <main className="flex min-h-dvh flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Link
          href="/home"
          className="text-sm text-neutral-500 transition hover:text-strow-ink"
        >
          ← Back
        </Link>
        <p className="text-sm text-neutral-500">{session.name}</p>
      </header>

      <CloseFlow baristaName={session.name} />
    </main>
  );
}
