import Link from "next/link";
import { OwnerLoginForm } from "./OwnerLoginForm";

export const dynamic = "force-dynamic";

export default function OwnerLoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-light tracking-tight">Strow Ops</h1>
          <p className="mt-1 text-sm text-neutral-500">Owner sign in</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <p className="mb-6 text-center text-sm text-neutral-600">
            Enter your owner PIN
          </p>

          <OwnerLoginForm />
        </div>

        <div className="mt-6 text-center text-xs text-neutral-400">
          Barista?{" "}
          <Link href="/login" className="underline">
            Go to barista login
          </Link>
        </div>
      </div>
    </div>
  );
}
