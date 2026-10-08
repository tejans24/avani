import { describe, expect, it } from "vitest";

import {
  candidateSlugs,
  chooseBoard,
  countPostings,
  extractBoardName,
  judgeHit,
  namesMatch,
  probeUrl,
  slugCandidates,
  workdayCandidates,
} from "@/lib/jobs/board-probe";
import { MISSION_EMPLOYERS } from "@/lib/jobs/companies";
import { CONTRACTORS } from "@/lib/jobs/contractors";

describe("candidateSlugs", () => {
  it("tries full-name forms first, then partial ones", () => {
    expect(candidateSlugs("Nava PBC")).toEqual(["nava"]);
    expect(candidateSlugs("Ad Hoc LLC")).toEqual(["adhoc", "ad-hoc"]);
    expect(slugCandidates("Booz Allen Hamilton")).toEqual([
      { slug: "boozallenhamilton", kind: "full" },
      { slug: "booz-allen-hamilton", kind: "full" },
      { slug: "boozallen", kind: "partial" },
      { slug: "booz-allen", kind: "partial" },
      { slug: "bah", kind: "partial" },
      { slug: "booz", kind: "partial" },
    ]);
  });

  it("includes the acronym, as a partial id", () => {
    expect(slugCandidates("General Dynamics Information Technology")).toContainEqual({ slug: "gdit", kind: "partial" });
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
    ).toEqual({ status: "feed", source: "GREENHOUSE", slug: "b", openPostings: 9, confirmed: true });
    expect(chooseBoard([]).status).toBe("capture-only");
  });

  it("prefers a confirmed board over a busier unconfirmed one", () => {
    const v = chooseBoard([
      { source: "GREENHOUSE", slug: "general", openPostings: 50, confirmed: false, why: "x" },
      { source: "LEVER", slug: "acme", openPostings: 3, confirmed: true, why: "y" },
    ]);
    expect(v).toMatchObject({ slug: "acme", confirmed: true });
  });
});

describe("name confirmation", () => {
  it("matches the same company and rejects a different one", () => {
    expect(namesMatch("CACI", "CACI International Inc")).toBe(true);
    expect(namesMatch("Accenture Federal Services", "Accenture Federal Services LLC")).toBe(true);
    expect(namesMatch("General Dynamics Information Technology", "GDIT")).toBe(true);
    expect(namesMatch("General Dynamics Information Technology", "General Assembly")).toBe(false);
    expect(namesMatch("Octo", "Octopus Energy")).toBe(false);
  });

  it("confirms by stated name, else only full-name ids", () => {
    expect(judgeHit("General Dynamics Information Technology", "partial", "General Assembly").confirmed).toBe(false);
    expect(judgeHit("CACI", "full", "CACI International Inc").confirmed).toBe(true);
    expect(judgeHit("Bellese Technologies", "full", null).confirmed).toBe(true);
    expect(judgeHit("General Dynamics Information Technology", "partial", null).confirmed).toBe(false);
  });

  it("reads the board name from Greenhouse and SmartRecruiters responses", () => {
    expect(extractBoardName("GREENHOUSE", { name: "Excella" })).toBe("Excella");
    expect(extractBoardName("SMARTRECRUITERS", { content: [{ company: { name: "CACI" } }] })).toBe("CACI");
    expect(extractBoardName("LEVER", [])).toBeNull();
  });
});

describe("workdayCandidates", () => {
  it("tries full-name, acronym and first-word tenants across common hosts and sites", () => {
    const c = workdayCandidates("Booz Allen Hamilton");
    expect(c[0]).toEqual({ host: "boozallenhamilton.wd1.myworkdayjobs.com", tenant: "boozallenhamilton", site: "External", kind: "full" });
    expect(c.some((x) => x.tenant === "bah" && x.kind === "partial")).toBe(true);
    expect(c.find((x) => x.tenant === "leidos")).toBeUndefined();
    expect(workdayCandidates("Leidos")[0].tenant).toBe("leidos");
  });
});

describe("company lists", () => {
  it("have unique names across contractors and mission employers", () => {
    const names = [...CONTRACTORS, ...MISSION_EMPLOYERS].map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
