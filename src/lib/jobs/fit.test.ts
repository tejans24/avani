import { describe, expect, it } from "vitest";

import { postingSiteLabel, postingSourceText } from "@/lib/jobs/display";
import { candidateFacts, codeChecks, codeChecksForPrompt, finalizeFit, personalGates, quoteInText, type FitOutput, type FitPostingFacts } from "@/lib/jobs/fit";
import { fitSystemPrompt } from "@/lib/jobs/fit-prompt";
import { resumeSchema } from "@/lib/jobs/resume-schema";
import { COMP_BANDS, PAY } from "@/lib/jobs/scoring-config";

const posting = (over: Partial<FitPostingFacts> = {}): FitPostingFacts => ({
  title: "Senior Engineer",
  companyName: "EAB",
  location: "Remote",
  workMode: "REMOTE",
  compMinCents: 190_000_00,
  compMaxCents: 210_000_00,
  postedAt: null,
  url: "https://careers.eab.com/jobs/1",
  filterFailures: [],
  descriptionText: "You will own the platform end to end and write code daily. Requires daily status reports to the client.",
  ...over,
});

const output = (over: Partial<FitOutput> = {}): FitOutput => ({
  verdict: "APPLY",
  reason: "Owns the platform.",
  screenOdds: "LIKELY",
  verdictDetail: "",
  watchTerms: [],
  certToGet: "",
  gates: [],
  realJob: { shape: "Software developer / modernization", quotes: ["own the platform end to end", "lead a team of forty"], tempo: [] },
  fitTable: [
    { item: "Platform ownership", status: "COVERED", evidence: "", bulletIds: ["b1", "made-up"] },
    { item: "Kafka", status: "COVERED", evidence: "", bulletIds: ["nope"] },
  ],
  criteria: [],
  pay: { actual: "$190K to $210K", formEntry: "", askOnCall: "" },
  tailoring: { header: "Senior Engineer", summary: "", skillsLead: [], skillsAdd: [], skillsCut: [], bullets: [], coverLetter: "", honestyFlags: [] },
  formFields: [],
  next: [],
  ...over,
});

const ctx = (p = posting()) => ({ posting: p, bulletIds: new Set(["b1", "b2"]), model: "test", now: new Date("2026-10-02T12:00:00Z") });

describe("PAY config", () => {
  it("drives the score bands", () => {
    expect(PAY.floorCents).toBe(130_000_00);
    expect(COMP_BANDS.map((b) => b.label)).toEqual([
      "Midpoint ≥ $200K",
      "Midpoint in the $185K–$215K target",
      "Midpoint $160K–$185K (under target)",
      "Midpoint $130K–$160K (well under target)",
      "Midpoint < $130K (range straddles the floor)",
    ]);
  });
});

describe("codeChecks", () => {
  it("checks pay against the floor and target", () => {
    const pay = (lo: number, hi: number) => codeChecks(posting({ compMinCents: lo, compMaxCents: hi })).pay;
    expect(pay(103_500_00, 125_000_00)).toMatchObject({ status: "FAIL", note: "$104K to $125K, entirely under the $130K floor" });
    expect(pay(103_500_00, 130_000_00).status).toBe("UNDER_TARGET");
    expect(pay(180_000_00, 200_000_00).status).toBe("PASS");
    expect(codeChecks(posting({ compMinCents: null, compMaxCents: null })).pay.status).toBe("UNKNOWN");
  });

  it("checks location without naming the home city", () => {
    const loc = (over: Partial<FitPostingFacts>) => codeChecks(posting(over)).location;
    expect(loc({}).status).toBe("PASS");
    expect(loc({ workMode: "HYBRID", filterFailures: ["Regular hybrid (set in-office days)"] }).status).toBe("FAIL");
    const far = loc({ workMode: "OCCASIONAL_HYBRID", location: "Denver, CO", filterFailures: ["Office not within ~1 hr of Baltimore (Denver, CO)"] });
    expect(far).toEqual({ status: "FAIL", note: "Office outside commuting range (Denver, CO)" });
    expect(codeChecksForPrompt(codeChecks(posting({ location: "Denver, CO", filterFailures: ["Office not within ~1 hr of Baltimore (Denver, CO)"] })))).not.toMatch(/Baltimore/);
  });
});

describe("fitSystemPrompt", () => {
  it("is the owner's evaluator, with pay from config and no home city", () => {
    const p = fitSystemPrompt();
    expect(p).toContain("You evaluate job postings for one specific candidate");
    expect(p).toContain("base pay target roughly $185K–$215K");
    expect(p).toContain("below $130K it does not work");
    expect(p).not.toMatch(/Baltimore/);
  });
});

describe("quoteInText", () => {
  it("matches across curly quotes, dashes, spacing and ellipses", () => {
    const text = "We’re building a  platform — end to end. You will write code daily.";
    expect(quoteInText("we're building a platform - end to end", text)).toBe(true);
    expect(quoteInText('"building a platform … write code daily"', text)).toBe(true);
    expect(quoteInText("manage a team of forty", text)).toBe(false);
  });
});

describe("finalizeFit", () => {
  it("drops bullet ids not in the résumé, and covered rows without a bullet become skills-list only", () => {
    const fit = finalizeFit(output(), ctx());
    expect(fit.fitTable[0]).toMatchObject({ status: "COVERED", bulletIds: ["b1"] });
    expect(fit.fitTable[1]).toMatchObject({ status: "SKILLS_LIST_ONLY", bulletIds: [] });
    expect(fit.checks).toContain("Removed 2 résumé reference(s) that don't match a bullet.");
  });

  it("marks real-job quotes that aren't in the posting", () => {
    expect(finalizeFit(output(), ctx()).unverifiedQuotes).toEqual([1]);
  });

  it("calls out applying despite a failed code check, and drops tailoring for non-apply verdicts", () => {
    const low = finalizeFit(output(), ctx(posting({ compMinCents: 100_000_00, compMaxCents: 120_000_00 })));
    expect(low.checks).toContain("Check: $100K to $120K, entirely under the $130K floor.");
    expect(finalizeFit(output({ verdict: "SKIP" }), ctx()).tailoring).toBeNull();
  });

  it("flags em dashes", () => {
    expect(finalizeFit(output({ reason: "Owns it — end to end." }), ctx()).checks.at(-1)).toMatch(/em dash/);
  });
});

describe("posting source", () => {
  it("names the site a job was added from, and how", () => {
    const eab = { source: "MANUAL", url: "https://careers.eab.com/jobs/1", capturedVia: "bookmarklet" };
    expect(postingSiteLabel(eab)).toBe("careers.eab.com");
    expect(postingSourceText(eab)).toBe("Added by you from careers.eab.com with the Add to Avani button");
    expect(postingSiteLabel({ source: "MANUAL", url: "https://www.linkedin.com/jobs/view/1/" })).toBe("LinkedIn");
    expect(postingSourceText({ source: "GREENHOUSE", url: "https://boards.greenhouse.io/x/jobs/1", capturedVia: null })).toBe("From Greenhouse");
  });
});

describe("citizenship and clearance gates, checked in the app", () => {
  const cleared = { usCitizen: true, clearanceLevel: 1 };
  it("passes, fails or asks, naming only what the posting wants", () => {
    expect(personalGates("U.S. Citizenship required. Public Trust clearance.", cleared)).toEqual({
      citizenship: { status: "PASS", note: "US citizenship required: you meet it" },
      clearance: { status: "PASS", note: "Posting asks for Public Trust: you meet it" },
    });
    expect(personalGates("Active TS/SCI required.", cleared).clearance).toEqual({ status: "FAIL", note: "Posting asks for TS/SCI: you don't currently hold it" });
    expect(personalGates("Must be able to obtain a Secret clearance.", cleared).clearance?.status).toBe("UNKNOWN");
    expect(personalGates("Build things.", cleared)).toEqual({});
    expect(personalGates("U.S. Citizenship required.", null)).toEqual({});
  });

  it("reads the owner's facts from the master, ignoring expired clearances", () => {
    const base = { contact: { firstName: "A", lastName: "B", email: "a@b.co", citizenship: "U.S. Citizen" }, headline: "Engineer", summary: "s", skills: [], experience: [{ id: "r", organization: "O", title: "T", periods: [{ start: "2020-01", end: null }], bullets: [{ id: "b", text: "Did it.", skills: [] }] }], education: [] };
    const m = (clearance: string[]) => resumeSchema.parse({ ...base, clearance });
    expect(candidateFacts(m(["Secret (active)"]))).toEqual({ usCitizen: true, clearanceLevel: 2 });
    expect(candidateFacts(m(["Top Secret (expired 2019)", "Public Trust (active)"])).clearanceLevel).toBe(1);
  });

  it("puts only the results in the prompt", () => {
    const text = codeChecksForPrompt(codeChecks(posting({ descriptionText: "U.S. Citizenship required. Public Trust." }), cleared));
    expect(text).toContain("CITIZENSHIP_CHECK: PASS");
    expect(text).toContain("CLEARANCE_CHECK: PASS");
  });
});
