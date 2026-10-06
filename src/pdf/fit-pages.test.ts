import { describe, expect, it } from "vitest";

import { resumeSchema } from "@/lib/jobs/resume-schema";
import { applyTrims, masterDoc, renderResume, trimPlan } from "@/lib/jobs/tailor";
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
  it("cuts older roles first, then recent roles beyond three, then skill lines, then older roles to their header", () => {
    const ops = trimPlan(long, masterDoc(long));
    const first = ops[0];
    expect(first).toEqual({ kind: "bullet", roleId: "role11", bulletId: "role11-3" });
    const firstRecent = ops.findIndex((o) => o.kind === "bullet" && ["role0", "role1", "role2"].includes(o.roleId));
    const firstSkills = ops.findIndex((o) => o.kind === "skills");
    const lastOlderSingle = ops.findIndex((o) => o.kind === "bullet" && o.bulletId === "role11-0");
    expect(firstRecent).toBeGreaterThan(ops.findIndex((o) => o.kind === "bullet" && o.bulletId === "role3-1"));
    expect(firstSkills).toBeGreaterThan(firstRecent);
    expect(lastOlderSingle).toBeGreaterThan(firstSkills);
    // Never below one bullet... until the last phase; recent roles keep three.
    const all = renderResume(long, applyTrims(masterDoc(long), ops));
    expect(all.experience.slice(0, 3).every((e) => e.bullets.length === 3)).toBe(true);
    expect(all.skills).toHaveLength(8);
  });
});

describe("fitDocToPages", () => {
  it("trims a long version to the page limit with cuts marked rejected", async () => {
    const doc = masterDoc(long);
    expect((await renderDocPdf(long, doc)).pages).toBeGreaterThan(2);
    const r = await fitDocToPages(long, doc, 2);
    expect(r.fits).toBe(true);
    expect(r.pages).toBeLessThanOrEqual(2);
    expect(r.bulletsCut).toBeGreaterThan(0);
    const rejected = r.doc.experience.flatMap((e) => e.bullets).filter((b) => b.status === "rejected").length;
    expect(rejected).toBe(r.bulletsCut);
    // As few cuts as it takes: one fewer would not fit. (Skill steps hide two lines each.)
    const used = r.bulletsCut + r.skillLinesHidden / 2;
    expect((await renderDocPdf(long, applyTrims(doc, trimPlan(long, doc).slice(0, used - 1)))).pages).toBeGreaterThan(2);
  }, 60_000);

  it("leaves a version that already fits alone", async () => {
    const short = resumeSchema.parse({ ...long, experience: long.experience.slice(0, 2), skills: long.skills.slice(0, 4) });
    const r = await fitDocToPages(short, masterDoc(short), 2);
    expect(r).toMatchObject({ bulletsCut: 0, skillLinesHidden: 0, fits: true });
  }, 30_000);
});
