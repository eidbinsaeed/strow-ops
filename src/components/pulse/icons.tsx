type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function Sparkle({ className = "h-6 w-6" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  );
}
export function PulseIcon({ className = "h-[22px] w-[22px]" }: P) {
  return (<svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>);
}
export function BooksIcon({ className = "h-[22px] w-[22px]" }: P) {
  return (<svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>);
}
export function StaffIcon({ className = "h-[22px] w-[22px]" }: P) {
  return (<svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .8 3.2 2.6 3.5 5.2" /></svg>);
}
export function MoreIcon({ className = "h-[22px] w-[22px]" }: P) {
  return (<svg viewBox="0 0 24 24" className={className} {...base} aria-hidden><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>);
}
export function CameraIcon({ className = "h-[34px] w-[34px]" }: P) {
  return (<svg viewBox="0 0 24 24" className={className} {...base} strokeWidth={1.8} aria-hidden><path d="M4 8.5A2.5 2.5 0 016.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0120 8.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5z" /><circle cx="12" cy="13" r="3.8" /></svg>);
}
export function CheckIcon({ className = "h-[18px] w-[18px]" }: P) {
  return (<svg viewBox="0 0 24 24" className={className} fill="none" stroke="#2350D0" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
}
export function BackIcon({ className = "h-5 w-5" }: P) {
  return (<svg viewBox="0 0 24 24" className={`${className} rtl:-scale-x-100`} {...base} aria-hidden><path d="M15 5l-7 7 7 7" /></svg>);
}
