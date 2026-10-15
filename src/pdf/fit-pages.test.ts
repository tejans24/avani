import { describe, expect, it } from "vitest";

import { resumeSchema } from "@/lib/jobs/resume-schema";
import { applyTrims, bulletRelevance, ensureOneBullet, masterDoc, renderResume, trimPlan } from "@/lib/jobs/tailor";
import { fitDocToPages, renderDocPdf } from "@/pdf/resume-render";

/** A long career like the owner's: 12 roles, 4 to 6 bullets each, 18 skill lines. */
const long = resumeSchema.parse({
  contact: { firstName: "Jordan", lastName: "Quill", email: "j@example.com" },
  headline: "Principal Engineer",
  summary: "Engineer and architect with 15 years building whole products in regulated environments, from discovery through operations.",
  skills: Array.from({ length: 18 }, (_, i) => ({ group: `Group ${i + 1}`, text: "Python, TypeScript, Java, Go, PostgreSQL, DynamoDB, Kafka, AWS Lambda, Step Functions, Terraform" })),
  experience: Array.from({ length: 12 }, (_, r) => ({
    id: `role${r}`,
    organization: `Organization ${r + 1}`,
    title: "Senior Engineer",
    periods: [{ start: `${2025 - r * 2}-01`, end: r === 0 ? null : `${2026 - r * 2}-12` }],
    bullets: Array.from({ length: r < 6 ? 6 : 4 }, (_, b) => ({
      id: `role${r}-${b}`,
      text: `Built and ran a service that moved claims processing for a state agency onto event-driven AWS infrastructure, cutting processing time and on-call load (${r}.${b}).`,
      skills: [],
    })),
  })),
  education: [{ id: "edu", text: "B.S. Computer Science" }],
});

describe("trimPlan", () => {
  it("keeps every role's best bullet, cuts older roles first, then recent roles, then skill lines", () => {
    const ops = trimPlan(long, masterDoc(long));
    expect(ops[0]).toMatchObject({ kind: "bullet", roleId: "role11" });
    const firstRecent = ops.findIndex((o) => o.kind === "bullet" && ["role0", "role1", "role2"].includes(o.roleId));
    const firstSkills = ops.findIndex((o) => o.kind === "skills");
    const lastOlder = ops.map((o, i) => (o.kind === "bullet" && !["role0", "role1", "role2"].includes(o.roleId) ? i : -1)).reduce((m, i) => Math.max(m, i), -1);
    expect(firstRecent).toBeGreaterThan(lastOlder);
    expect(firstSkills).toBeGreaterThan(firstRecent);
    // Everything applied: no role is ever empty; recent roles keep two, older roles one.
    const all = renderResume(long, applyTrims(masterDoc(long), ops));
    expect(all.experience.every((e) => e.bullets.length >= 1)).toBe(true);
    expect(all.experience.slice(0, 3).every((e) => e.bullets.length === 2)).toBe(true);
    expect(all.experience.slice(3).every((e) => e.bullets.length === 1)).toBe(true);
    expect(all.skills).toHaveLength(8);
  });

  it("what gets cut depends on the posting: the least relevant bullets go first, cited ones last", () => {
    const resume = resumeSchema.parse({
      ...long,
      experience: [
        ...long.experience.slice(0, 3),
        {
          id: "old",
          organization: "Old Co",
          title: "Engineer",
          periods: [{ start: "2010-01", end: "2012-12" }],
          bullets: [
            { id: "old-1", text: "Organized the office holiday party and managed the snack budget.", skills: [] },
            { id: "old-2", text: "Built a FHIR interoperability service for Medicaid eligibility.", skills: [] },
            { id: "old-3", text: "Answered phones at the front desk.", skills: [] },
          ],
        },
      ],
    });
    const score = bulletRelevance({ title: "Medicaid interoperability engineer", descriptionText: "FHIR eligibility services" });
    const ops = trimPlan(resume, masterDoc(resume), { score });
    const oldCuts = ops.filter((o) => o.kind === "bullet" && o.roleId === "old").map((o) => (o as { bulletId: string }).bulletId);
    expect(oldCuts).not.toContain("old-2"); // the relevant one stays
    expect(oldCuts).toHaveLength(2);
    // A bullet the evaluation cited outranks keyword overlap.
    const cited = trimPlan(resume, masterDoc(resume), { score, protect: new Set(["old-3"]) });
    expect(cited.some((o) => o.kind === "bullet" && o.bulletId === "old-3")).toBe(false);
  });
});

describe("ensureOneBullet", () => {
  it("gives an emptied role back its most relevant bullet, and leaves roles you left out alone", () => {
    const doc = masterDoc(long);
    doc.experience[5].bullets.forEach((b) => (b.status = "rejected"));
    doc.experience[6].bullets = [];
    doc.experience[7].omitted = true;
    const fixed = ensureOneBullet(long, doc);
    const r = renderResume(long, fixed);
    expect(r.experience.find((e) => e.id === "role5")!.bullets).toHaveLength(1);
    expect(r.experience.find((e) => e.id === "role6")!.bullets).toHaveLength(1);
    expect(r.experience.find((e) => e.id === "role7")).toBeUndefined();
  });
});

describe("fitDocToPages", () => {
  it("trims a long version to the page limit with cuts marked rejected", async () => {
    const doc = masterDoc(long);
    expect((await renderDocPdf(long, doc)).pages).toBeGreaterThan(2);
    const r = await fitDocToPages(long, doc, { maxPages: 2 });
    expect(r.fits).toBe(true);
    expect(r.overLimit).toBe(false);
    expect(r.pages).toBeLessThanOrEqual(2);
    expect(r.bulletsCut).toBeGreaterThan(0);
    const rejected = r.doc.experience.flatMap((e) => e.bullets).filter((b) => b.status === "rejected").length;
    expect(rejected).toBe(r.bulletsCut);
    expect(renderResume(long, r.doc).experience.every((e) => e.bullets.length >= 1)).toBe(true);
  }, 60_000);

  it("runs to the longer limit rather than emptying roles when nothing else fits", async () => {
    // Twenty-four roles: one bullet each can't fit on two pages.
    const huge = resumeSchema.parse({ ...long, experience: [...long.experience, ...long.experience.map((e) => ({ ...e, id: `${e.id}b`, bullets: e.bullets.map((b) => ({ ...b, id: `${b.id}b` })) }))] });
    const r = await fitDocToPages(huge, masterDoc(huge), { maxPages: 2, hardMaxPages: 3 });
    expect(r.overLimit).toBe(true);
    expect(r.pages).toBeGreaterThan(2);
    expect(renderResume(huge, r.doc).experience.every((e) => e.bullets.length >= 1)).toBe(true);
  }, 120_000);

  it("leaves a version that already fits alone", async () => {
    const short = resumeSchema.parse({ ...long, experience: long.experience.slice(0, 2), skills: long.skills.slice(0, 4) });
    const r = await fitDocToPages(short, masterDoc(short), { maxPages: 2 });
    expect(r).toMatchObject({ bulletsCut: 0, skillLinesHidden: 0, fits: true });
  }, 30_000);
});
