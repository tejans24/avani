import { isoToUtcDate } from "@/lib/dates";

export type DisplayStatus = "DRAFT" | "SENT" | "PAID" | "VOID" | "OVERDUE";

function truncateToUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Derive the display status for an invoice. A SENT invoice whose due date
 * (UTC date-only) is strictly before today becomes OVERDUE; every other
 * status is shown as stored. `now` exists for testability.
 */
export function deriveDisplayStatus(
  inv: { status: string; dueDate: Date | string },
  now: Date = new Date()
): DisplayStatus {
  const status = inv.status as DisplayStatus;
  if (status !== "SENT") return status;

  const due = truncateToUtcMidnight(
    typeof inv.dueDate === "string" ? isoToUtcDate(inv.dueDate) : inv.dueDate
  );
  const today = truncateToUtcMidnight(now);
  return due.getTime() < today.getTime() ? "OVERDUE" : "SENT";
}

export type StatusTone = "neutral" | "info" | "positive" | "critical" | "caution";

/** Map a display status to the visual tone used by the status badge. */
export function statusTone(s: DisplayStatus): StatusTone {
  switch (s) {
    case "DRAFT":
      return "neutral";
    case "SENT":
      return "info";
    case "PAID":
      return "positive";
    case "OVERDUE":
      return "critical";
    case "VOID":
      return "caution";
  }
}
