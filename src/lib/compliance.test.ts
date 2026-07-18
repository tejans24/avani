import { describe, expect, it } from "vitest";

import { isoToUtcDate } from "@/lib/dates";
import { daysUntil, nextDeadline, openWindows, windowOpen, type DeadlineLike } from "@/lib/compliance";

function deadline(overrides: Partial<DeadlineLike> = {}): DeadlineLike {
  return {
    key: "1120s",
    title: "File Form 1120-S",
    dueDate: isoToUtcDate("2026-03-15"),
    leadDays: 30,
    enabled: true,
    ...overrides,
  };
}

describe("windowOpen", () => {
  // dueDate 2026-03-15, leadDays 30 -> window opens 2026-02-13
  const d = deadline();

  it("is closed the day before the window opens", () => {
    expect(windowOpen(d, isoToUtcDate("2026-02-12"))).toBe(false);
  });

  it("is open on the opening day", () => {
    expect(windowOpen(d, isoToUtcDate("2026-02-13"))).toBe(true);
  });

  it("is open on the due date itself", () => {
    expect(windowOpen(d, isoToUtcDate("2026-03-15"))).toBe(true);
  });

  it("is closed the day after the due date", () => {
    expect(windowOpen(d, isoToUtcDate("2026-03-16"))).toBe(false);
  });

  it("is never open when disabled", () => {
    expect(windowOpen(deadline({ enabled: false }), isoToUtcDate("2026-03-01"))).toBe(false);
  });
});

describe("daysUntil", () => {
  const d = deadline();

  it("is positive before, zero on, and negative after the due date", () => {
    expect(daysUntil(d, isoToUtcDate("2026-03-10"))).toBe(5);
    expect(daysUntil(d, isoToUtcDate("2026-03-15"))).toBe(0);
    expect(daysUntil(d, isoToUtcDate("2026-03-20"))).toBe(-5);
  });

  it("counts whole UTC days across month boundaries", () => {
    expect(daysUntil(d, isoToUtcDate("2026-02-13"))).toBe(30);
  });
});

describe("openWindows", () => {
  it("returns only open windows sorted by due date ascending", () => {
    const later = deadline({ key: "q1-est", dueDate: isoToUtcDate("2026-04-15"), leadDays: 60 });
    const sooner = deadline({ key: "1120s" });
    const notYet = deadline({ key: "annual-report", dueDate: isoToUtcDate("2026-12-01"), leadDays: 14 });
    const disabled = deadline({ key: "disabled", enabled: false });

    const result = openWindows([later, notYet, disabled, sooner], isoToUtcDate("2026-03-01"));
    expect(result.map((d) => d.key)).toEqual(["1120s", "q1-est"]);
  });

  it("returns [] when nothing is open", () => {
    expect(openWindows([deadline()], isoToUtcDate("2026-01-01"))).toEqual([]);
  });
});

describe("nextDeadline", () => {
  const list = [
    deadline({ key: "past", dueDate: isoToUtcDate("2026-01-15") }),
    deadline({ key: "soonest-disabled", dueDate: isoToUtcDate("2026-02-20"), enabled: false }),
    deadline({ key: "next", dueDate: isoToUtcDate("2026-03-15") }),
    deadline({ key: "later", dueDate: isoToUtcDate("2026-04-15") }),
  ];

  it("picks the soonest enabled deadline due on or after now", () => {
    expect(nextDeadline(list, isoToUtcDate("2026-02-01"))!.key).toBe("next");
  });

  it("includes a deadline due today", () => {
    expect(nextDeadline(list, isoToUtcDate("2026-03-15"))!.key).toBe("next");
  });

  it("returns null when every enabled deadline is past", () => {
    expect(nextDeadline(list, isoToUtcDate("2026-05-01"))).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(nextDeadline([], isoToUtcDate("2026-05-01"))).toBeNull();
  });
});
