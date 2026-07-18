import { describe, expect, it } from "vitest";

import { deriveDisplayStatus, statusTone, type DisplayStatus } from "@/lib/invoice-status";

// Fixed "now": 2026-06-15T13:45:00Z -> today (UTC) is 2026-06-15.
const NOW = new Date(Date.UTC(2026, 5, 15, 13, 45, 0));
const YESTERDAY = "2026-06-14";
const TODAY = "2026-06-15";
const TOMORROW = "2026-06-16";

describe("deriveDisplayStatus", () => {
  it("never marks DRAFT, PAID or VOID as overdue, even past due", () => {
    for (const status of ["DRAFT", "PAID", "VOID"] as const) {
      expect(deriveDisplayStatus({ status, dueDate: YESTERDAY }, NOW)).toBe(status);
      expect(deriveDisplayStatus({ status, dueDate: "2020-01-01" }, NOW)).toBe(status);
    }
  });

  it("marks SENT as OVERDUE when due date was yesterday", () => {
    expect(deriveDisplayStatus({ status: "SENT", dueDate: YESTERDAY }, NOW)).toBe("OVERDUE");
  });

  it("keeps SENT when due today (not strictly before)", () => {
    expect(deriveDisplayStatus({ status: "SENT", dueDate: TODAY }, NOW)).toBe("SENT");
  });

  it("keeps SENT when due tomorrow", () => {
    expect(deriveDisplayStatus({ status: "SENT", dueDate: TOMORROW }, NOW)).toBe("SENT");
  });

  it("accepts Date due dates and compares by UTC date only", () => {
    expect(
      deriveDisplayStatus({ status: "SENT", dueDate: new Date(Date.UTC(2026, 5, 14)) }, NOW)
    ).toBe("OVERDUE");
    // Due today at UTC midnight with a late-in-day "now" is still just SENT.
    expect(
      deriveDisplayStatus(
        { status: "SENT", dueDate: new Date(Date.UTC(2026, 5, 15)) },
        new Date(Date.UTC(2026, 5, 15, 23, 59, 59))
      )
    ).toBe("SENT");
  });

  it("keeps non-SENT statuses when due far in the future", () => {
    expect(deriveDisplayStatus({ status: "DRAFT", dueDate: "2030-01-01" }, NOW)).toBe("DRAFT");
    expect(deriveDisplayStatus({ status: "SENT", dueDate: "2030-01-01" }, NOW)).toBe("SENT");
  });
});

describe("statusTone", () => {
  it("maps every display status to its badge tone", () => {
    const expected: Record<DisplayStatus, ReturnType<typeof statusTone>> = {
      DRAFT: "neutral",
      SENT: "info",
      PAID: "positive",
      OVERDUE: "critical",
      VOID: "caution",
    };
    for (const [status, tone] of Object.entries(expected)) {
      expect(statusTone(status as DisplayStatus)).toBe(tone);
    }
  });
});
