/**
 * Job pipeline playbook — status labels and follow-up cadence. Pure data +
 * pure functions (unit-tested), like bd-playbook.ts: the tick detector and the
 * job detail page both read from here so the timing lives in one place.
 *
 * The app never applies or emails anyone. It only reminds the owner.
 */

export type JobStatus =
  | "NEW"
  | "SHORTLISTED"
  | "APPLIED"
  | "INTERVIEWING"
  | "OFFER"
  | "CLOSED"
  | "SKIPPED";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  NEW: "New",
  SHORTLISTED: "Shortlisted",
  APPLIED: "Applied",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  CLOSED: "Closed",
  SKIPPED: "Skipped",
};

/** Statuses that count as "in flight" on the pipeline page. */
export const ACTIVE_STATUSES: JobStatus[] = ["SHORTLISTED", "APPLIED", "INTERVIEWING", "OFFER"];

/**
 * Default follow-up after entering a status: days until the first nudge and
 * what it says. null = no automatic follow-up.
 */
export const STATUS_FOLLOW_UP: Record<JobStatus, { days: number; note: string } | null> = {
  NEW: null,
  SHORTLISTED: { days: 5, note: "Tailor and apply, or skip" },
  APPLIED: { days: 7, note: "No response yet. Follow up with the recruiter?" },
  INTERVIEWING: { days: 1, note: "Send a thank-you note" },
  OFFER: { days: 3, note: "Compare total comp and benefits, then respond" },
  CLOSED: null,
  SKIPPED: null,
};

/** An application with no activity for this long is suggested for closing. */
export const APPLIED_STALE_DAYS = 21;

const DAY_MS = 86_400_000;

/** Next follow-up after a status change on `on` (date-only, UTC midnight). */
export function defaultNextAction(
  status: JobStatus,
  on: Date
): { note: string; due: Date } | null {
  const rule = STATUS_FOLLOW_UP[status];
  if (!rule) return null;
  const start = Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate());
  return { note: rule.note, due: new Date(start + rule.days * DAY_MS) };
}

/** True when an APPLIED posting has had no activity for APPLIED_STALE_DAYS. */
export function isStaleApplication(
  status: JobStatus,
  lastActivityAt: Date,
  now: Date
): boolean {
  return status === "APPLIED" && now.getTime() - lastActivityAt.getTime() >= APPLIED_STALE_DAYS * DAY_MS;
}
