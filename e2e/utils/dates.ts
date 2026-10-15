/**
 * Dates relative to the real clock, for specs whose UI state depends on
 * "today" (an invoice due in the past renders Overdue, not Sent). Hard-coded
 * calendar dates in these specs started failing once they passed.
 */
export function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-09-12" → "Sep 12, 2026", as the app renders dates (UTC). */
export function formatIsoLong(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
