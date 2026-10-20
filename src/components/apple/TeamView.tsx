import { Reveal } from "@/components/motion/Reveal";
import type { Locale } from "@/lib/i18n/dict";
import { COLOR } from "@/lib/sections";
import { Group, LargeTitle, Row, Rows } from "./ui";

export type Person = { id: string; name: string; onShift: boolean };

/** Team: everyone at a glance (green dot = on shift), then the team pages. */
export function TeamView({ people, locale }: { people: Person[]; locale: Locale }) {
  const ar = locale === "ar";
  const on = people.filter((p) => p.onShift).length;
  return (
    <div className="page reveal-js">
      <Reveal className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <div data-reveal="">
          <LargeTitle
            title={ar ? "الفريق" : "Team"}
            subtitle={ar ? `${people.length} أشخاص${on ? ` · ${on} في الدوام` : ""}` : `${people.length} ${people.length === 1 ? "person" : "people"}${on ? ` · ${on} on shift` : ""}`}
          />
        </div>
        {people.length ? (
          <div data-reveal="" className="-mx-4 flex gap-3.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {people.map((p) => (
              <span key={p.id} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white text-xl font-semibold text-strow-ink">
                  {p.name.trim().charAt(0).toUpperCase()}
                  {p.onShift ? <span aria-label={ar ? "في الدوام" : "On shift"} className="absolute bottom-0.5 end-0.5 h-3.5 w-3.5 rounded-full bg-[#008932] ring-2 ring-[#F2F2F7]" /> : null}
                </span>
                <span className="max-w-16 truncate text-[13px] text-neutral-500">{p.name.split(" ")[0]}</span>
              </span>
            ))}
          </div>
        ) : null}
        <Group title={ar ? "الفريق" : "People"}>
          <Rows>
            <Row href="/owner/baristas" icon="people" color={COLOR.teal} label={ar ? "الموظفون" : "Staff"} detail={people.length} />
            <Row href="/owner/attendance" icon="clock" color={COLOR.teal} label={ar ? "الحضور" : "Attendance"} />
            <Row href="/owner/attendance/reports" icon="folder" color={COLOR.teal} label={ar ? "سجلات الموظفين" : "Staff records"} />
          </Rows>
        </Group>
      </Reveal>
    </div>
  );
}
