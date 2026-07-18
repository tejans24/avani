/**
 * Pure compliance-deadline helpers. A deadline's "window" opens leadDays
 * before its due date and closes at the end of the due date. All comparisons
 * use UTC calendar days (date-only), matching the rest of the app.
 */

export type DeadlineLike = {
  key: string;
  title: string;
  dueDate: Date;
  leadDays: number;
  enabled: boolean;
};

const DAY_MS = 86_400_000;

/** Truncate a Date to UTC midnight (milliseconds). */
function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Whole UTC days from `now` until the deadline's due date.
 * 0 = due today, positive = upcoming, negative = past due.
 */
export function daysUntil(d: DeadlineLike, now: Date): number {
  return Math.round((utcMidnight(d.dueDate) - utcMidnight(now)) / DAY_MS);
}

/**
 * True when the deadline is enabled and `now` falls inside its reminder
 * window: dueDate - leadDays <= now <= dueDate (inclusive on both ends).
 */
export function windowOpen(d: DeadlineLike, now: Date): boolean {
  if (!d.enabled) return false;
  const days = daysUntil(d, now);
  return days >= 0 && days <= d.leadDays;
}

/** All deadlines whose window is open at `now`, sorted by due date ascending. */
export function openWindows(deadlines: DeadlineLike[], now: Date): DeadlineLike[] {
  return deadlines
    .filter((d) => windowOpen(d, now))
    .sort((a, b) => utcMidnight(a.dueDate) - utcMidnight(b.dueDate));
}

/** The soonest enabled deadline with dueDate >= now (UTC days), or null. */
export function nextDeadline(deadlines: DeadlineLike[], now: Date): DeadlineLike | null {
  let best: DeadlineLike | null = null;
  for (const d of deadlines) {
    if (!d.enabled || daysUntil(d, now) < 0) continue;
    if (!best || utcMidnight(d.dueDate) < utcMidnight(best.dueDate)) best = d;
  }
  return best;
}
