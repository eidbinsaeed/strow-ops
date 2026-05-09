"use client";

export function OwnerLogoutButton() {
  return (
    <form
      action="/api/auth/owner-logout"
      method="POST"
      className="block w-full"
    >
      <div className="px-3 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">
        Signed in
      </div>
      <button
        type="submit"
        className="block w-full rounded-md px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100"
      >
        Sign out
      </button>
    </form>
  );
}
