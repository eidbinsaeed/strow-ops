"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";

type Staff = { id: string; name: string; role: string };

export function StaffSelect({
  staff,
  selected,
  allLabel,
}: {
  staff: Staff[];
  selected: string | null;
  allLabel: string;
}) {
  const router = useRouter();
  return (
    <select
      value={selected ?? ""}
      onChange={(e) =>
        router.push(
          (e.target.value
            ? "/owner/attendance/reports?staff=" + e.target.value
            : "/owner/attendance/reports") as Route,
        )
      }
      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-strow-ink focus:outline-none"
    >
      <option value="">{allLabel}</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.role})
        </option>
      ))}
    </select>
  );
}
