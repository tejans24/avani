/**
 * Date-only utilities. All values are handled in UTC so that a date like
 * "2026-06-14" never shifts by a day regardless of the server/client timezone.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse "YYYY-MM-DD" into a Date at UTC midnight. Throws on malformed or impossible dates. */
export function isoToUtcDate(iso: string): Date {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) {
    throw new Error(`Invalid ISO date string: "${iso}" (expected YYYY-MM-DD)`);
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: "${iso}"`);
  }
  return date;
}

/** Format a Date as "YYYY-MM-DD" using its UTC fields. */
export function dateToIso(d: Date): string {
  const year = String(d.getUTCFullYear()).padStart(4, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toUtcDate(d: Date | string): Date {
  return typeof d === "string" ? isoToUtcDate(d) : d;
}

/** "06/14/26" (MM/DD/YY, UTC fields). Accepts a Date or "YYYY-MM-DD" string. */
export function formatDateShort(d: Date | string): string {
  const date = toUtcDate(d);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const year = String(date.getUTCFullYear() % 100).padStart(2, "0");
  return `${month}/${day}/${year}`;
}

const longFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Jun 14, 2026" (UTC fields). Accepts a Date or "YYYY-MM-DD" string. */
export function formatDateLong(d: Date | string): string {
  return longFormatter.format(toUtcDate(d));
}

/**
 * Add n business days (skipping Saturday and Sunday), UTC-based.
 * Negative n walks backwards. Returns a new Date; the input is not mutated.
 */
export function addBusinessDaysUtc(d: Date, n: number): Date {
  const result = new Date(d.getTime());
  const step = n < 0 ? -1 : 1;
  let remaining = Math.abs(Math.trunc(n));
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + step);
    const dow = result.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      remaining -= 1;
    }
  }
  return result;
}

/** Add n calendar days, UTC-based. Returns a new Date; input not mutated. */
export function addCalendarDaysUtc(d: Date, n: number): Date {
  const result = new Date(d.getTime());
  result.setUTCDate(result.getUTCDate() + Math.trunc(n));
  return result;
}

export type NetDaysMode = "BUSINESS" | "CALENDAR";

/** Add payment-term days, honoring the business/calendar mode. */
export function addNetDaysUtc(d: Date, n: number, mode: NetDaysMode): Date {
  return mode === "CALENDAR" ? addCalendarDaysUtc(d, n) : addBusinessDaysUtc(d, n);
}

/** The current date truncated to UTC midnight. */
export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
