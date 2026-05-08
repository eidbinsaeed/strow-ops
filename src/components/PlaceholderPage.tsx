import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

type PlaceholderPageProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  backHref: Route;
  backLabel?: string;
  comingWhen?: string;
};

export function PlaceholderPage({
  title,
  description,
  icon,
  backHref,
  backLabel = "← Back",
  comingWhen = "Coming soon",
}: PlaceholderPageProps) {
  return (
    <main className="flex min-h-dvh flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Link
          href={backHref}
          className="text-sm text-neutral-500 transition hover:text-strow-ink"
        >
          {backLabel}
        </Link>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          {comingWhen}
        </span>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 py-12 text-center">
        {icon ? (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
            {icon}
          </div>
        ) : null}
        <div>
          <h1 className="text-xl font-medium">{title}</h1>
          <p className="mt-3 text-sm text-neutral-500">{description}</p>
        </div>
        <Link
          href={backHref}
          className="rounded-full bg-strow-ink px-5 py-2.5 text-sm font-medium text-white transition active:scale-95"
        >
          Back
        </Link>
      </div>
    </main>
  );
}
