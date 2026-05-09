import Link from "next/link";
import { OwnerLoginForm } from "./OwnerLoginForm";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized:
    "That email isn't on the owner allowlist. If you think this is a mistake, contact the account owner.",
  exchange_failed:
    "That sign-in link has expired or has already been used. Request a new one.",
  missing_code: "The sign-in link looked malformed. Request a new one.",
};

export default async function OwnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorKey = params.error;
  const errorMessage = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? errorKey.replace(/_/g, " "))
    : null;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-light tracking-tight">Strow Ops</h1>
          <p className="mt-1 text-sm text-neutral-500">Owner sign in</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          <p className="mb-4 text-sm text-neutral-600">
            Enter your email. If you&apos;re on the owner allowlist, we&apos;ll
            send a one-tap sign-in link.
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
