/** The Home period switch. Kept apart from home-periods.ts so client code can import it without the server helpers. */
export type PeriodKey = "week" | "month" | "year";
export const PERIOD_KEYS: PeriodKey[] = ["week", "month", "year"];
