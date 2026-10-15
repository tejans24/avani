import { describe, expect, it } from "vitest";

import { defaultNextAction, isStaleApplication } from "@/lib/jobs/pipeline";

describe("defaultNextAction", () => {
  it("schedules a follow-up 7 days after applying, date-only", () => {
    const next = defaultNextAction("APPLIED", new Date("2026-10-02T21:30:00Z"));
    expect(next?.due.toISOString()).toBe("2026-10-09T00:00:00.000Z");
    expect(next?.note).toMatch(/follow up/i);
  });

  it("asks for a thank-you note the day after an interview", () => {
    expect(defaultNextAction("INTERVIEWING", new Date("2026-10-02T15:00:00Z"))?.due.toISOString()).toBe(
      "2026-10-03T00:00:00.000Z"
    );
  });

  it("has no follow-up for new, closed or skipped postings", () => {
    for (const s of ["NEW", "CLOSED", "SKIPPED"] as const) {
      expect(defaultNextAction(s, new Date())).toBeNull();
    }
  });
});

describe("isStaleApplication", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  it("flags applications quiet for 21+ days", () => {
    expect(isStaleApplication("APPLIED", new Date("2026-10-09T12:00:00Z"), now)).toBe(true);
    expect(isStaleApplication("APPLIED", new Date("2026-10-10T12:00:00Z"), now)).toBe(false);
  });

  it("only applies to APPLIED", () => {
    expect(isStaleApplication("INTERVIEWING", new Date("2026-01-01T00:00:00Z"), now)).toBe(false);
  });
});
