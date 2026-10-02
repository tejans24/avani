import { describe, expect, it } from "vitest";

import { resumeSchema } from "@/lib/jobs/resume-schema";
import { checkDocStyle, checkTruth, docFromOutput, hasBlocking, omittedRoleGaps, quickTailor, renderResume, type TailorOutput } from "@/lib/jobs/tailor";

const master = resumeSchema.parse({
  contact: { firstName: "Jordan", lastName: "Quill", email: "j@example.com" },
  headline: "Principal Engineer and Architect",
  headlineOptions: ["Principal Engineer"],
  summary: "Engineer with 15 years building regulated systems on AWS.",
  skills: [
    { group: "Languages", text: "Python, TypeScript, Java" },
    { group: "Healthcare interoperability", text: "FHIR, X12 270/271" },
  ],
  experience: [
    {
      id: "avani",
      organization: "Avani",
      title: "Principal Engineer / Founder",
      periods: [{ start: "2024-07", end: null }],
      bullets: [
        { id: "avani-1", text: "Built the AWS backend for a prior-authorization platform handling PHI with FHIR and X12.", skills: ["fhir-healthcare", "aws-serverless"] },
        { id: "avani-2", text: "Ran the firm: contracts, proposals, hiring.", skills: [] },
        { id: "avani-3", text: "Built evaluation suites for RAG accuracy and prompt injection.", skills: ["llm-rag"], reserve: true },
      ],
    },
    {
      id: "va",
      organization: "Digital Service at VA",
      title: "Senior Lead Engineer",
      periods: [{ start: "2017-02", end: "2019-05" }],
      bullets: [{ id: "va-1", text: "Caseflow Intake went to production in one month for 450,000+ pending appeals.", skills: [] }],
    },
  ],
  education: [{ id: "edu-1", text: "B.S. Computer Science" }],
});

const output = (over: Partial<TailorOutput> = {}): TailorOutput => ({
  headline: "Principal Engineer",
  summary: "Engineer with 15 years building regulated systems on AWS.",
  experience: [
    { roleId: "avani", bullets: [{ id: "avani-1", text: "Built the AWS backend for a prior-authorization platform handling PHI with FHIR and X12." }] },
    { roleId: "va", bullets: [{ id: "va-1", text: "Caseflow Intake went to production in one month for 450,000+ pending appeals." }] },
  ],
  skillGroupOrder: ["Healthcare interoperability", "Languages"],
  coverNote: "I build regulated systems on AWS.",
  rationale: "Healthcare first.",
  ...over,
});

describe("docFromOutput", () => {
  it("keeps only bullets that trace to master under the right role, deduped", () => {
    const doc = docFromOutput(
      master,
      output({
        experience: [
          { roleId: "avani", bullets: [{ id: "avani-1", text: "x" }, { id: "avani-1", text: "dup" }, { id: "va-1", text: "wrong role" }, { id: "made-up", text: "y" }] },
        ],
      }),
      "claude"
    );
    expect(doc.experience.find((r) => r.id === "avani")!.bullets.map((b) => b.id)).toEqual(["avani-1"]);
    expect(doc.experience.find((r) => r.id === "va")!.bullets).toEqual([]);
  });

  it("falls back to the master headline when the model invents one", () => {
    expect(docFromOutput(master, output({ headline: "Chief Visionary" }), "claude").headline).toBe("Principal Engineer and Architect");
  });
});

describe("checkTruth", () => {
  it("passes faithful tailoring", () => {
    expect(checkTruth(master, docFromOutput(master, output(), "claude"))).toEqual([]);
  });

  it("blocks a reworded bullet that adds a number", () => {
    const doc = docFromOutput(
      master,
      output({ experience: [{ roleId: "va", bullets: [{ id: "va-1", text: "Shipped Caseflow Intake in one month, cutting backlog 40% for 450,000+ appeals." }] }] }),
      "claude"
    );
    const issues = checkTruth(master, doc);
    expect(issues).toEqual([expect.objectContaining({ severity: "block", where: "bullet:va-1", message: expect.stringContaining("40%") })]);
  });

  it("flags tools and names that appear nowhere in master", () => {
    const doc = docFromOutput(master, output({ summary: "Engineer with 15 years building regulated systems on AWS and Kubernetes at Google." }), "claude");
    const issues = checkTruth(master, doc);
    expect(issues).toEqual([expect.objectContaining({ severity: "warn", where: "summary", message: expect.stringMatching(/Kubernetes, Google/) })]);
  });

  it("blocks summary numbers that aren't in master", () => {
    const doc = docFromOutput(master, output({ summary: "Engineer with 20 years building regulated systems on AWS." }), "claude");
    expect(checkTruth(master, doc)[0]).toMatchObject({ severity: "block", where: "summary" });
  });

  it("ignores rejected bullets", () => {
    const doc = docFromOutput(master, output({ experience: [{ roleId: "va", bullets: [{ id: "va-1", text: "Cut costs 99%." }] }] }), "claude");
    doc.experience[1].bullets[0].status = "rejected";
    expect(checkTruth(master, doc)).toEqual([]);
  });
});

describe("checkDocStyle + hasBlocking", () => {
  it("blocks an em dash anywhere and keeps master wording as the baseline", () => {
    const doc = docFromOutput(master, output({ coverNote: "I build regulated systems — on AWS." }), "claude");
    const style = checkDocStyle(master, doc);
    expect(style.map((s) => s.where)).toEqual(["coverNote"]);
    expect(hasBlocking([], style)).toBe(true);
  });
});

describe("renderResume", () => {
  it("applies choices, drops rejected bullets, and orders skill groups", () => {
    const doc = docFromOutput(master, output(), "claude");
    doc.experience[1].bullets[0].status = "rejected";
    const r = renderResume(master, doc);
    expect(r.headline).toBe("Principal Engineer");
    expect(r.skills.map((s) => s.group)).toEqual(["Healthcare interoperability", "Languages"]);
    expect(r.experience[0].bullets.map((b) => b.id)).toEqual(["avani-1"]);
    expect(r.experience[1].bullets).toEqual([]);
    expect(r.contact.firstName).toBe("Jordan");
  });
});

describe("leaving roles out", () => {
  it("drops an omitted role from the résumé and from the checks", () => {
    const doc = docFromOutput(master, output(), "claude");
    doc.experience[1].omitted = true;
    doc.experience[1].bullets[0].text = "Shipped to 9,000,000 users — fast.";
    expect(renderResume(master, doc).experience.map((e) => e.id)).toEqual(["avani"]);
    expect(checkTruth(master, doc).some((i) => i.where === "bullet:va-1")).toBe(false);
    expect(checkDocStyle(master, doc).some((i) => i.where === "bullet:va-1")).toBe(false);
  });

  it("warns about a gap, except when the oldest role is dropped", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const doc = docFromOutput(master, output(), "claude");
    doc.experience[1].omitted = true; // VA, the oldest
    expect(omittedRoleGaps(master, doc, now)).toEqual([]);
    doc.experience[1].omitted = false;
    doc.experience[0].omitted = true; // the current role
    expect(omittedRoleGaps(master, doc, now)).toEqual([{ roleId: "avani", gaps: ["Jul 2024 to Oct 2026"] }]);
  });
});

describe("quickTailor", () => {
  it("selects relevant bullets without changing wording, and leaves reserve ones out unless relevant", () => {
    const doc = quickTailor(master, { title: "Senior Engineer", descriptionText: "Build FHIR and X12 integrations on AWS Lambda for prior authorization." });
    const avani = doc.experience.find((r) => r.id === "avani")!;
    expect(avani.bullets[0].id).toBe("avani-1");
    expect(avani.bullets.map((b) => b.id)).not.toContain("avani-3");
    expect(avani.bullets[0].text).toBe(master.experience[0].bullets[0].text);
    expect(doc.skillGroupOrder[0]).toBe("Healthcare interoperability");
    expect(checkTruth(master, doc)).toEqual([]);
  });

  it("brings in a reserve bullet when the posting asks for it", () => {
    const doc = quickTailor(master, { title: "AI Engineer", descriptionText: "RAG evaluation, LLM guardrails and prompt injection testing." });
    expect(doc.experience[0].bullets.map((b) => b.id)).toContain("avani-3");
  });
});
