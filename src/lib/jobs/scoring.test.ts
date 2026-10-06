import { describe, expect, it } from "vitest";

import { classifyLane, classifyWorkMode, scorePosting, type ScoringInput } from "@/lib/jobs/scoring";

const NOW = new Date("2026-10-02T12:00:00Z");

function posting(over: Partial<ScoringInput> = {}): ScoringInput {
  return {
    title: "Senior Software Engineer",
    descriptionText: "Build software.",
    location: "Remote",
    companyName: "Example Co",
    source: "GREENHOUSE",
    postedAt: new Date("2026-09-28T00:00:00Z"),
    compMinCents: null,
    compMaxCents: null,
    ...over,
  };
}

const CMS_POSTING = posting({
  title: "Principal Software Engineer",
  companyName: "Nava PBC",
  descriptionText: `
Join a small team of 8 modernizing a legacy Medicaid eligibility system for a state agency serving residents.
You will own the platform end-to-end: design and build event-driven services on AWS (Lambda, Step Functions,
DynamoDB, Kafka) and integrate with multiple external systems via FHIR. This is a hands-on role with
architecture decisions. We are piloting LLMs with RAG and guardrails for caseworkers.
Remote (US). Public Trust required.`,
  compMinCents: 190_000_00,
  compMaxCents: 220_000_00,
});

describe("scorePosting: a strong CMS-style posting", () => {
  const r = scorePosting(CMS_POSTING, NOW);

  it("passes every filter", () => {
    expect(r.filterFailures).toEqual([]);
  });

  it("scores high with every point explained", () => {
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.breakdown.every((b) => b.evidence.length > 0)).toBe(true);
    const rules = r.breakdown.map((b) => b.rule);
    expect(rules).toEqual(expect.arrayContaining(["end-to-end", "design-authority", "hands-on", "legacy-modernization", "ai-core", "small-team", "health"]));
  });

  it("classifies it as a gov-contractor lane, remote", () => {
    expect(r.lane).toBe("GOV_CONTRACTOR");
    expect(r.workMode).toBe("REMOTE");
  });

  it("respects category caps", () => {
    expect(r.categoryTotals.stack).toBeLessThanOrEqual(10);
    expect(r.categoryTotals.scope).toBeLessThanOrEqual(20);
  });
});

describe("scorePosting: hard filters", () => {
  const fails = (over: Partial<ScoringInput>) => scorePosting(posting(over), NOW).filterFailures;

  it("rejects old postings", () => {
    expect(fails({ postedAt: new Date("2026-08-01T00:00:00Z") })[0]).toMatch(/^Posted 62 days ago/);
  });

  it("rejects regular hybrid and on-site", () => {
    expect(fails({ location: "Denver, CO", descriptionText: "Hybrid: 3 days a week in the office." })).toContain(
      "Regular hybrid (set in-office days)"
    );
    expect(fails({ location: "Fort Meade, MD", descriptionText: "100% on-site." })).toContain("On-site role");
  });

  it("allows occasional hybrid near Baltimore, rejects it far away", () => {
    expect(fails({ location: "Columbia, MD", descriptionText: "Occasional on-site meetings." })).toEqual([]);
    expect(fails({ location: "Austin, TX", descriptionText: "Occasional on-site meetings." })[0]).toMatch(/^Office not within/);
  });

  it("keeps a remote role with occasional travel, flagged", () => {
    const r = scorePosting(posting({ location: "Remote - US", descriptionText: "Occasional travel to our SF office." }), NOW);
    expect(r.filterFailures).toEqual([]);
    expect(r.workMode).toBe("REMOTE");
    expect(r.flags).toContain("Remote with occasional in-person travel");
  });

  it("rejects clearance above Public Trust unless obtainable", () => {
    expect(fails({ descriptionText: "Active TS/SCI with polygraph required." })[0]).toMatch(/^Clearance/);
    expect(fails({ descriptionText: "Must be able to obtain a Secret clearance." })).toEqual([]);
  });

  it("rejects pay ranges entirely under the floor, but scores ones that straddle it", () => {
    expect(fails({ compMinCents: 100_000_00, compMaxCents: 125_000_00 })).toContain("Pay range entirely under $130K");
    const r = scorePosting(posting({ compMinCents: 110_000_00, compMaxCents: 140_000_00 }), NOW);
    expect(r.filterFailures).toEqual([]);
    expect(r.breakdown.find((b) => b.rule === "comp-band")?.points).toBe(-10);
    // Above the floor but under the target: kept, scored lower.
    const under = scorePosting(posting({ compMinCents: 140_000_00, compMaxCents: 175_000_00 }), NOW);
    expect(under.filterFailures).toEqual([]);
    expect(under.breakdown.find((b) => b.rule === "comp-band")?.points).toBe(-4);
  });

  it("rejects the dealbreakers", () => {
    expect(fails({ descriptionText: "This role requires 50% travel." })[0]).toMatch(/^Heavy travel/);
    expect(fails({ descriptionText: "Provide daily status reports to the COR." })[0]).toMatch(/^Daily status reporting/);
    expect(fails({ descriptionText: "Must hold a Security+ certification." })[0]).toMatch(/^Day-one certification/);
    expect(fails({ descriptionText: "Must hold Security+ within 6 months of hire." })).toEqual([]);
    expect(fails({ descriptionText: "Scale our ad tech bidding platform." })[0]).toMatch(/^Outside your mission/);
    expect(fails({ descriptionText: "On behalf of our client, a Fortune 500 company." })[0]).toMatch(/^Staffing agency/);
    expect(fails({ isStaffingAgency: true })).toContain("Staffing agency repost");
    expect(fails({ location: "Toronto, Canada" })[0]).toMatch(/^Not US-based/);
  });
});

describe("scorePosting: scoring", () => {
  it("penalizes narrow ticket work and architect-only roles", () => {
    const ticket = scorePosting(posting({ descriptionText: "Work assigned tickets in Jira. Bug fixes and maintenance." }), NOW);
    const architect = scorePosting(posting({ descriptionText: "Enterprise architect; not a hands-on role." }), NOW);
    const base = scorePosting(posting(), NOW);
    expect(ticket.score).toBeLessThan(base.score);
    expect(architect.score).toBeLessThan(base.score);
    expect(architect.breakdown.map((b) => b.rule)).not.toContain("hands-on");
  });

  it("flags missing comp and unclear mission", () => {
    const r = scorePosting(posting({ companyName: "Widget SaaS", descriptionText: "Build B2B SaaS dashboards." }), NOW);
    expect(r.flags).toEqual(expect.arrayContaining(["No comp range posted", "Mission unclear from the posting"]));
  });

  it("gives mission credit to mission lanes without keywords", () => {
    const r = scorePosting(posting({ source: "USAJOBS", companyName: "Department of the Interior" }), NOW);
    expect(r.breakdown.find((b) => b.rule === "mission-lane")?.points).toBe(6);
  });

  it("adds the current-award signal with its evidence", () => {
    const r = scorePosting(posting({ currentAward: { summary: "EPA · $48.3M · through Aug 2031" } }), NOW);
    expect(r.breakdown.find((b) => b.rule === "current-award")).toMatchObject({ category: "work", points: 4, evidence: "EPA · $48.3M · through Aug 2031" });
    expect(r.score).toBe(scorePosting(posting(), NOW).score + 4);
  });

  it("clamps to 0–100", () => {
    const awful = scorePosting(
      posting({
        descriptionText:
          "Fast-paced startup, Series A. Founding engineer. Zero downtime. Weekly status reports. Work assigned tickets. " +
          "Oversee vendor deliverables. Enterprise architect, not a hands-on role. Engineering manager. Experience in the utilities industry.",
        compMinCents: 150_000_00,
        compMaxCents: 200_000_00,
      }),
      NOW
    );
    expect(awful.score).toBeGreaterThanOrEqual(0);
    expect(awful.categoryTotals.redFlags).toBeGreaterThanOrEqual(-30);
  });
});

describe("classifyWorkMode", () => {
  it("prefers a source hint, then the text, then the location", () => {
    expect(classifyWorkMode("Baltimore, MD", "In office 3 days", "REMOTE")).toBe("REMOTE");
    expect(classifyWorkMode("Remote", "Hybrid: 3 days a week in the office", null)).toBe("HYBRID");
    expect(classifyWorkMode("Remote", "No mention", null)).toBe("REMOTE");
    expect(classifyWorkMode("Baltimore, MD", "No mention", null)).toBe("UNKNOWN");
    expect(classifyWorkMode("San Francisco, CA", "On-site 5 days a week in the office.", null)).toBe("ONSITE");
    expect(classifyWorkMode("Baltimore, MD", "3 days a week in the office.", null)).toBe("HYBRID");
  });
});

describe("classifyLane", () => {
  it("uses override, then gov signals, then the best keyword lane", () => {
    expect(classifyLane({ source: "LEVER", companyName: "X", laneOverride: "INTERNAL_TOOLS" }, "climate")).toBe("INTERNAL_TOOLS");
    expect(classifyLane({ source: "WORKDAY", companyName: "Leidos", laneOverride: null }, "")).toBe("GOV_CONTRACTOR");
    expect(classifyLane({ source: "ASHBY", companyName: "X", laneOverride: null }, "climate and carbon removal; decarbonization")).toBe(
      "CLIMATE_CONSERVATION"
    );
    expect(classifyLane({ source: "ASHBY", companyName: "X", laneOverride: null }, "nothing relevant")).toBe("UNCLASSIFIED");
  });
});

describe("classifyWorkMode: remote offered as one option", () => {
  it("doesn't call it regular hybrid when remote is among the choices", () => {
    expect(classifyWorkMode("Washington, DC", "Ability to work in a hybrid, remote, or client-site environment as program needs require.")).toBe("UNKNOWN");
    expect(classifyWorkMode("Reston, VA", "This role can be remote or hybrid.")).toBe("UNKNOWN");
    expect(classifyWorkMode("Reston, VA", "This is a hybrid role, 3 days a week in the office.")).toBe("HYBRID");
    expect(classifyWorkMode("Reston, VA", "Hybrid schedule with our Reston team.")).toBe("HYBRID");
    // Technology, not a schedule.
    expect(classifyWorkMode("Reston, VA", "Familiarity with hybrid cloud architectures.")).toBe("UNKNOWN");
  });
});
