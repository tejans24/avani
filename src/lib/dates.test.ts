import { describe, expect, it } from "vitest";

import {
  addBusinessDaysUtc,
  addCalendarDaysUtc,
  addNetDaysUtc,
  dateToIso,
  formatDateLong,
  formatDateShort,
  isoToUtcDate,
  todayUtc,
} from "@/lib/dates";

describe("addCalendarDaysUtc / addNetDaysUtc", () => {
  const wed = isoToUtcDate("2026-07-15"); // Wednesday

  it("calendar days count weekends", () => {
    expect(dateToIso(addCalendarDaysUtc(wed, 30))).toBe("2026-08-14");
  });

  it("addNetDaysUtc dispatches by mode", () => {
    // 15 calendar days from Wed Jul 15 = Thu Jul 30
    expect(dateToIso(addNetDaysUtc(wed, 15, "CALENDAR"))).toBe("2026-07-30");
    // 15 business days = Wed Aug 5 (matches addBusinessDaysUtc)
    expect(dateToIso(addNetDaysUtc(wed, 15, "BUSINESS"))).toBe(
      dateToIso(addBusinessDaysUtc(wed, 15))
    );
  });
});

describe("isoToUtcDate", () => {
  it("parses to UTC midnight regardless of process timezone", () => {
    const d = isoToUtcDate("2026-06-14");
    expect(d.getTime()).toBe(Date.UTC(2026, 5, 14));
    expect(d.toISOString()).toBe("2026-06-14T00:00:00.000Z");
  });

  it("throws on malformed input", () => {
    expect(() => isoToUtcDate("06/14/2026")).toThrow();
    expect(() => isoToUtcDate("2026-6-14")).toThrow();
    expect(() => isoToUtcDate("2026-06-14T00:00:00Z")).toThrow();
    expect(() => isoToUtcDate("")).toThrow();
    expect(() => isoToUtcDate("not-a-date")).toThrow();
  });

  it("throws on impossible calendar dates", () => {
    expect(() => isoToUtcDate("2026-13-01")).toThrow();
    expect(() => isoToUtcDate("2026-02-30")).toThrow();
    expect(() => isoToUtcDate("2026-00-10")).toThrow();
    expect(() => isoToUtcDate("2026-04-31")).toThrow();
  });

  it("accepts leap-day in a leap year", () => {
    expect(dateToIso(isoToUtcDate("2028-02-29"))).toBe("2028-02-29");
    expect(() => isoToUtcDate("2026-02-29")).toThrow();
  });
});

describe("dateToIso", () => {
  it("round-trips with isoToUtcDate", () => {
    for (const iso of ["2026-06-14", "2026-01-01", "2026-12-31", "2000-02-29"]) {
      expect(dateToIso(isoToUtcDate(iso))).toBe(iso);
    }
  });

  it("uses UTC fields, not local time", () => {
    // 2026-06-14T23:30Z is still June 14 in UTC even if local TZ rolls over.
    expect(dateToIso(new Date(Date.UTC(2026, 5, 14, 23, 30)))).toBe("2026-06-14");
    expect(dateToIso(new Date(Date.UTC(2026, 5, 14, 0, 0)))).toBe("2026-06-14");
  });
});

describe("formatDateShort", () => {
  it("formats as MM/DD/YY from an ISO string", () => {
    expect(formatDateShort("2026-06-14")).toBe("06/14/26");
    expect(formatDateShort("2026-01-05")).toBe("01/05/26");
    expect(formatDateShort("2009-12-31")).toBe("12/31/09");
  });

  it("formats a Date using UTC fields (no timezone day-shift)", () => {
    expect(formatDateShort(new Date(Date.UTC(2026, 5, 14)))).toBe("06/14/26");
    // 23:30 UTC would already be "the next day" in TZs east of UTC.
    expect(formatDateShort(new Date(Date.UTC(2026, 5, 14, 23, 30)))).toBe("06/14/26");
    // 00:30 UTC would still be "the previous day" in TZs west of UTC.
    expect(formatDateShort(new Date(Date.UTC(2026, 5, 14, 0, 30)))).toBe("06/14/26");
  });
});

describe("formatDateLong", () => {
  it("formats as 'Mon D, YYYY' in UTC", () => {
    expect(formatDateLong("2026-06-14")).toBe("Jun 14, 2026");
    expect(formatDateLong("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDateLong(new Date(Date.UTC(2026, 11, 31, 23, 59)))).toBe("Dec 31, 2026");
  });
});

describe("addBusinessDaysUtc", () => {
  it("skips weekends: Friday + 1 business day = Monday", () => {
    // 2026-07-17 is a Friday.
    const fri = isoToUtcDate("2026-07-17");
    expect(dateToIso(addBusinessDaysUtc(fri, 1))).toBe("2026-07-20");
  });

  it("computes issue 2026-07-16 + 15 business days = 2026-08-06", () => {
    const issue = isoToUtcDate("2026-07-16");
    expect(dateToIso(addBusinessDaysUtc(issue, 15))).toBe("2026-08-06");
  });

  it("handles multi-week spans and zero", () => {
    const mon = isoToUtcDate("2026-07-13"); // Monday
    expect(dateToIso(addBusinessDaysUtc(mon, 5))).toBe("2026-07-20"); // next Monday
    expect(dateToIso(addBusinessDaysUtc(mon, 0))).toBe("2026-07-13");
  });

  it("does not mutate the input date", () => {
    const d = isoToUtcDate("2026-07-16");
    addBusinessDaysUtc(d, 10);
    expect(dateToIso(d)).toBe("2026-07-16");
  });

  it("walks backwards for negative n", () => {
    const mon = isoToUtcDate("2026-07-20"); // Monday
    expect(dateToIso(addBusinessDaysUtc(mon, -1))).toBe("2026-07-17"); // Friday
  });
});

describe("todayUtc", () => {
  it("is truncated to UTC midnight", () => {
    const t = todayUtc();
    expect(t.getUTCHours()).toBe(0);
    expect(t.getUTCMinutes()).toBe(0);
    expect(t.getUTCSeconds()).toBe(0);
    expect(t.getUTCMilliseconds()).toBe(0);
    // Matches the current UTC calendar date.
    expect(dateToIso(t)).toBe(new Date().toISOString().slice(0, 10));
  });
});
