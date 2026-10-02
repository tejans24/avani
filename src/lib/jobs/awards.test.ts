import { describe, expect, it } from "vitest";

import {
  DEFAULT_AWARD_QUERIES,
  buildAwardSearchBody,
  displayRecipient,
  formatAwardAmount,
  isCurrentAward,
  parseAwardResults,
  pickCurrentAward,
} from "@/lib/jobs/awards";

const NOW = new Date("2026-10-02T12:00:00Z");

describe("buildAwardSearchBody", () => {
  it("filters contracts by agency, IT/R&D NAICS and the last 90 days", () => {
    const noaa = DEFAULT_AWARD_QUERIES.find((q) => q.label === "NOAA")!;
    const body = buildAwardSearchBody(noaa, NOW, 2);
    expect(body.filters.agencies).toEqual([
      { type: "awarding", tier: "subtier", name: "National Oceanic and Atmospheric Administration", toptier_name: "Department of Commerce" },
    ]);
    expect(body.filters.award_type_codes).toEqual(["A", "B", "C", "D"]);
    expect(body.filters.time_period).toEqual([{ start_date: "2026-07-04", end_date: "2026-10-02" }]);
    expect(body.page).toBe(2);
  });

  it("uses a toptier filter for departments", () => {
    const epa = DEFAULT_AWARD_QUERIES.find((q) => q.label === "EPA")!;
    expect(buildAwardSearchBody(epa, NOW, 1).filters.agencies).toEqual([{ type: "awarding", tier: "toptier", name: "Environmental Protection Agency" }]);
  });
});

describe("parseAwardResults", () => {
  it("normalizes rows, links by normalized recipient, and skips incomplete ones", () => {
    const { awards, hasNext } = parseAwardResults({
      results: [
        {
          "Award ID": "68HERC26C0001",
          "Recipient Name": "PATUXENT EARTH ANALYTICS, INC.",
          "Award Amount": 48250000.5,
          Description: "DATA PLATFORM MODERNIZATION SUPPORT",
          "Start Date": "2026-08-15",
          "End Date": "2031-08-14",
          "Awarding Agency": "Environmental Protection Agency",
          "Awarding Sub Agency": "Environmental Protection Agency",
          NAICS: { code: "541512", description: "Computer Systems Design Services" },
          "Place of Performance State Code": "MD",
          generated_internal_id: "CONT_AWD_68HERC26C0001_6800_-NONE-_-NONE-",
        },
        { "Award ID": "X", "Recipient Name": null, generated_internal_id: "CONT_AWD_X" },
      ],
      page_metadata: { hasNext: true },
    });
    expect(hasNext).toBe(true);
    expect(awards).toHaveLength(1);
    expect(awards[0]).toMatchObject({
      piid: "68HERC26C0001",
      recipientName: "Patuxent Earth Analytics, Inc.",
      normalizedRecipient: "patuxent earth analytics",
      amountCents: BigInt(4825000050),
      naics: "541512",
      placeState: "MD",
      url: "https://www.usaspending.gov/award/CONT_AWD_68HERC26C0001_6800_-NONE-_-NONE-",
    });
    expect(awards[0].endDate?.toISOString().slice(0, 10)).toBe("2031-08-14");
  });

  it("tolerates an empty or malformed body", () => {
    expect(parseAwardResults(null)).toEqual({ awards: [], hasNext: false });
  });
});

describe("current award signal", () => {
  const a = (start: string | null, end: string | null, cents: bigint) => ({
    agency: "EPA",
    subAgency: null,
    piid: start ?? "x",
    amountCents: cents,
    startDate: start ? new Date(start) : null,
    endDate: end ? new Date(end) : null,
  });

  it("counts awards still in performance that started within 18 months", () => {
    expect(isCurrentAward(a("2026-08-15", "2031-08-14", BigInt(1)), NOW)).toBe(true);
    expect(isCurrentAward(a("2026-01-01", "2026-09-30", BigInt(1)), NOW)).toBe(false); // ended
    expect(isCurrentAward(a("2023-01-01", "2030-01-01", BigInt(1)), NOW)).toBe(false); // old
  });

  it("picks the largest current award", () => {
    const best = pickCurrentAward([a("2026-08-15", "2031-08-14", BigInt(5)), a("2026-07-01", "2029-06-30", BigInt(9)), a("2026-01-01", "2026-09-30", BigInt(99))], NOW);
    expect(best?.amountCents).toBe(BigInt(9));
  });
});

describe("display helpers", () => {
  it("formats amounts and recipient names", () => {
    expect(formatAwardAmount(BigInt(4825000050))).toBe("$48.3M");
    expect(formatAwardAmount(null)).toBe("—");
    expect(displayRecipient("BOOZ ALLEN HAMILTON INC.")).toBe("Booz Allen Hamilton Inc.");
    expect(displayRecipient("ICF INCORPORATED, L.L.C.")).toBe("ICF Incorporated, L.L.C.");
    expect(displayRecipient("Already Mixed Case LLC")).toBe("Already Mixed Case LLC");
  });
});
