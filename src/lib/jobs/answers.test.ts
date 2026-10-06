import { describe, expect, it } from "vitest";

import { classifyQuestion, localAnswer, mergeAnswers, parseQuestions, type ApplicationAnswer } from "@/lib/jobs/answers";
import { resumeSchema } from "@/lib/jobs/resume-schema";

const master = resumeSchema.parse({
  contact: {
    firstName: "Jordan",
    lastName: "Quill",
    email: "j@example.com",
    phone: "410-555-0199",
    location: "Towson, MD",
    citizenship: "U.S. Citizen",
    links: [
      { label: "LinkedIn", url: "linkedin.com/in/jquill" },
      { label: "GitHub", url: "github.com/jquill" },
    ],
  },
  headline: "Principal Engineer",
  summary: "Engineer.",
  skills: [{ group: "Languages", text: "Python" }],
  experience: [
    { id: "firm", organization: "Example", title: "Engineer", periods: [{ start: "2021-03", end: null }], bullets: [{ id: "f1", text: "Built things.", skills: [] }] },
  ],
  clearance: ["Public Trust (active)"],
  education: [{ id: "e1", text: "B.S." }],
});

describe("classifyQuestion", () => {
  it("keeps personal and self-identification questions in the app", () => {
    const cases: [string, string][] = [
      ["First name", "firstName"],
      ["Last Name*", "lastName"],
      ["Name", "fullName"],
      ["Email address", "email"],
      ["Phone number", "phone"],
      ["LinkedIn profile", "linkedin"],
      ["Portfolio or GitHub", "website"],
      ["City", "location"],
      ["Where are you located?", "location"],
      ["Are you a U.S. citizen?", "citizenship"],
      ["Are you legally authorized to work in the United States?", "workAuthorization"],
      ["Will you now or in the future require visa sponsorship?", "sponsorship"],
      ["Do you hold an active security clearance?", "clearance"],
      ["What are your salary expectations?", "salary"],
      ["Gender", "selfId"],
      ["Are you a protected veteran?", "selfId"],
    ];
    for (const [q, kind] of cases) expect(classifyQuestion(q), q).toBe(kind);
  });

  it("sends real questions to Claude, even when they mention a place or a name", () => {
    for (const q of [
      "Why do you want to work here?",
      "Describe your experience with FHIR.",
      "Are you willing to relocate to our DC location?",
      "What is the name of a project you're proud of?",
    ]) {
      expect(classifyQuestion(q), q).toBe("open");
    }
  });
});

describe("parseQuestions", () => {
  it("one per line, without numbering, markers or duplicates", () => {
    expect(parseQuestions("1. First name *\n- Email (required)\n\n• Why us?\nwhy us?\n")).toEqual(["First name", "Email", "Why us?"]);
  });
});

describe("localAnswer", () => {
  const a = (q: string, ctx = {}) => localAnswer(master, q, classifyQuestion(q), ctx);
  it("answers from the master résumé and pay config", () => {
    expect(a("First name").answer).toBe("Jordan");
    expect(a("Name").answer).toBe("Jordan Quill");
    expect(a("Phone").answer).toBe("410-555-0199");
    expect(a("LinkedIn").answer).toBe("linkedin.com/in/jquill");
    expect(a("Website").answer).toBe("github.com/jquill");
    expect(a("Are you authorized to work in the US?").answer).toBe("Yes");
    expect(a("Do you require sponsorship?").answer).toBe("No");
    expect(a("Security clearance").answer).toBe("Public Trust (active)");
    expect(a("Desired salary").answer).toBe("$185K to $215K");
    expect(a("Desired salary", { payFormEntry: "$190,000" }).answer).toBe("$190,000");
  });

  it("never answers self-identification, and says what's missing", () => {
    expect(a("Gender")).toMatchObject({ answer: "" });
    const noPhone = resumeSchema.parse({ ...master, contact: { ...master.contact, phone: undefined } });
    expect(localAnswer(noPhone, "Phone", "phone", {}).note).toMatch(/Add your phone number/);
  });
});

describe("mergeAnswers", () => {
  const ans = (question: string, answer: string, source: ApplicationAnswer["source"]): ApplicationAnswer => ({ id: question + answer, question, answer, source, note: "", updatedAt: "" });
  it("replaces drafts for the same question but never the owner's own answer", () => {
    const merged = mergeAnswers([ans("Why us?", "old draft", "claude"), ans("Why now?", "mine", "you")], [ans("why us?", "new draft", "claude"), ans("Why now?", "draft", "claude"), ans("Extra", "x", "claude")]);
    expect(merged.map((m) => m.answer)).toEqual(["new draft", "mine", "x"]);
  });
});
