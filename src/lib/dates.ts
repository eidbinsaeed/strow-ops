/** Today's date in Qave's timezone (Asia/Dubai) as YYYY-MM-DD. */
export function todayDubai(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

/** Validates a YYYY-MM-DD string that is not in the future (Dubai time). */
export function validPastOrToday(d: string | null | undefined): d is string {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayDubai();
}

/** "Sat, 27 Sep" style label for a YYYY-MM-DD string. */
export function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
