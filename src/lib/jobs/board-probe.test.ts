import { describe, expect, it } from "vitest";

import { candidateSlugs, chooseBoard, countPostings, probeUrl } from "@/lib/jobs/board-probe";
import { MISSION_EMPLOYERS } from "@/lib/jobs/companies";
import { CONTRACTORS } from "@/lib/jobs/contractors";

describe("candidateSlugs", () => {
  it("tries joined, hyphenated and first-word forms", () => {
    expect(candidateSlugs("Nava PBC")).toEqual(["navapbc", "nava-pbc", "nava"]);
    expect(candidateSlugs("Ad Hoc LLC")).toEqual(["adhoc", "ad-hoc"]);
  });

  it("adds two-word forms for long names", () => {
    expect(candidateSlugs("Booz Allen Hamilton")).toEqual([
      "boozallenhamilton", "booz-allen-hamilton", "booz", "boozallen", "booz-allen",
    ]);
  });
});

describe("probeUrl", () => {
  it("builds each documented public API url", () => {
    expect(probeUrl("GREENHOUSE", "navapbc")).toBe("https://boards-api.greenhouse.io/v1/boards/navapbc/jobs");
    expect(probeUrl("LEVER", "x")).toBe("https://api.lever.co/v0/postings/x?mode=json");
  });
});

describe("countPostings", () => {
  it("reads each API's shape and rejects non-boards", () => {
    expect(countPostings("GREENHOUSE", 200, { jobs: [{}, {}] })).toBe(2);
    expect(countPostings("GREENHOUSE", 404, { status: 404 })).toBeNull();
    expect(countPostings("LEVER", 200, [{}, {}, {}])).toBe(3);
    expect(countPostings("ASHBY", 200, { jobs: [] })).toBe(0);
    expect(countPostings("SMARTRECRUITERS", 200, { totalFound: 0, content: [] })).toBeNull();
    expect(countPostings("SMARTRECRUITERS", 200, { totalFound: 12, content: [] })).toBe(12);
  });
});

describe("chooseBoard", () => {
  it("picks the busiest board, or capture-only when none answered", () => {
    expect(
      chooseBoard([
        { source: "LEVER", slug: "a", openPostings: 2 },
        { source: "GREENHOUSE", slug: "b", openPostings: 9 },
      ])
    ).toEqual({ status: "feed", source: "GREENHOUSE", slug: "b", openPostings: 9 });
    expect(chooseBoard([]).status).toBe("capture-only");
  });
});

describe("company lists", () => {
  it("have unique names across contractors and mission employers", () => {
    const names = [...CONTRACTORS, ...MISSION_EMPLOYERS].map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
