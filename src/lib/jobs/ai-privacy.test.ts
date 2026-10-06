import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The privacy rule, checked on the actual request bodies: the Anthropic client
 * is replaced by a fake that records what would have been sent, and every
 * Claude feature is run with the owner's details planted in the posting, the
 * notes and the chat message.
 */

const sent: unknown[] = [];
let nextOutput: unknown = null;

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        parse: async (args: unknown) => {
          sent.push(args);
          return { stop_reason: "end_turn", parsed_output: nextOutput };
        },
      },
    };
  },
}));

import { resumeSchema } from "@/lib/jobs/resume-schema";
import { draftAnswersWithClaude, jobChatWithClaude } from "@/lib/jobs/answers-ai";
import { analyzeFitWithClaude } from "@/lib/jobs/fit-ai";
import { docFromOutput } from "@/lib/jobs/tailor";
import { chatAboutResumeWithClaude, tailorWithClaude } from "@/lib/jobs/tailor-ai";

const master = resumeSchema.parse({
  contact: {
    firstName: "Jordan",
    lastName: "Quill",
    email: "jordan.quill@example.com",
    phone: "410-555-0199",
    location: "Towson, MD",
    links: [{ label: "LinkedIn", url: "https://linkedin.com/in/jquill" }],
  },
  headline: "Principal Engineer",
  summary: "Engineer building regulated systems on AWS.",
  skills: [{ group: "Languages", text: "Python, TypeScript" }],
  experience: [
    {
      id: "firm",
      organization: "Example Consultancy",
      title: "Principal Engineer",
      location: "Towson, MD",
      periods: [{ start: "2021-03", end: null }],
      bullets: [{ id: "firm-1", text: "Built eligibility services on AWS Lambda.", skills: [] }],
    },
  ],
  clearance: ["Public Trust (active), Example Agency, 2023"],
  education: [{ id: "edu-1", text: "B.S. Computer Science" }],
});

// Clearance details stay in the app too (the evaluator gets only the app's pass/fail check).
const PERSONAL = ["jordan", "quill", "jordan.quill@example.com", "410-555-0199", "5550199", "towson", "linkedin.com/in/jquill", "example agency, 2023"];
const posting = {
  title: "Senior Engineer",
  companyName: "Example Agency",
  lane: "GOV_CONTRACTOR" as const,
  descriptionText: "Build eligibility services. Questions? Ask Jordan Quill at jordan.quill@example.com. Office in Towson, MD.",
};

function expectNothingPersonal() {
  expect(sent.length).toBeGreaterThan(0);
  const body = JSON.stringify(sent).toLowerCase();
  for (const v of PERSONAL) expect(body, `request contained "${v}"`).not.toContain(v);
}

const envBefore = { ...process.env };
beforeAll(() => {
  delete process.env.TAILOR_MODE;
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterAll(() => {
  process.env = envBefore;
});
beforeEach(() => {
  sent.length = 0;
});

describe("nothing personal reaches Claude", () => {
  it("tailoring, with personal details in the notes and the evaluation plan", async () => {
    nextOutput = { headline: "Principal Engineer", summary: "s", experience: [], skillGroupOrder: [], coverNote: "", rationale: "" };
    await tailorWithClaude({
      master,
      posting,
      tailoringNotes: "Recruiter called Jordan at 410-555-0199.",
      fitPlan: { header: "Senior Engineer", summary: "Mention Quill's work", skillsLead: [], skillsAdd: [], skillsCut: [], bullets: [], coverLetter: "", honestyFlags: [] },
    });
    expectNothingPersonal();
  });

  it("the résumé chat, including a message that names the owner", async () => {
    nextOutput = { reply: "ok", edits: [] };
    const doc = docFromOutput(master, { headline: "Principal Engineer", summary: "Jordan Quill builds things.", experience: [], skillGroupOrder: [], coverNote: "", rationale: "" }, "claude");
    await chatAboutResumeWithClaude({
      master,
      posting,
      doc,
      history: [
        { role: "user", text: "My email is jordan.quill@example.com" },
        { role: "assistant", text: "Noted." },
      ],
      message: "I'm Jordan Quill from Towson, MD; linkedin.com/in/jquill. Shorten the summary.",
    });
    expectNothingPersonal();
  });

  it("the fit evaluation", async () => {
    nextOutput = {
      verdict: "SKIP",
      reason: "r",
      screenOdds: "NA",
      verdictDetail: "",
      watchTerms: [],
      certToGet: "",
      gates: [],
      realJob: { shape: "", quotes: [], tempo: [] },
      fitTable: [],
      criteria: [],
      pay: { actual: "", formEntry: "", askOnCall: "" },
      tailoring: null,
      formFields: [],
      next: [],
    };
    await analyzeFitWithClaude({
      master,
      posting: {
        ...posting,
        location: "Towson, MD",
        workMode: "OCCASIONAL_HYBRID",
        compMinCents: null,
        compMaxCents: null,
        postedAt: null,
        url: "https://careers.example.org/1",
        filterFailures: [],
        tailoringNotes: "Jordan's notes",
      },
      breakdown: [],
      now: new Date("2026-10-06T12:00:00Z"),
    });
    expectNothingPersonal();
  });

  it("drafting application answers", async () => {
    nextOutput = { answers: [] };
    await draftAnswersWithClaude({ master, posting, fit: null, questions: ["Why do you want to work with Jordan Quill's old team in Towson?"] });
    expectNothingPersonal();
  });

  it("the chat about the job", async () => {
    nextOutput = { reply: "ok", answers: [] };
    await jobChatWithClaude({
      master,
      posting,
      fit: null,
      history: [
        { role: "user", text: "Call me at 410-555-0199" },
        { role: "assistant", text: "Noted." },
      ],
      message: "I'm Jordan (jordan.quill@example.com). Is this a building role?",
    });
    expectNothingPersonal();
  });

  it("an employer named after the home city is résumé content: sent intact, not refused", async () => {
    // The owner lives in Towson and worked for the City of Towson.
    const local = resumeSchema.parse({
      ...master,
      experience: [
        ...master.experience,
        {
          id: "towson-city",
          organization: "City of Towson, Digital Services",
          title: "Lead Engineer",
          location: "Towson, MD",
          periods: [{ start: "2018-01", end: "2021-02" }],
          bullets: [{ id: "towson-city-1", text: "Moved permits online for the City of Towson.", skills: [] }],
        },
      ],
    });
    nextOutput = { headline: "Principal Engineer", summary: "s", experience: [], skillGroupOrder: [], coverNote: "", rationale: "" };
    await tailorWithClaude({ master: local, posting, tailoringNotes: null });
    nextOutput = { reply: "ok", edits: [] };
    const doc = docFromOutput(local, { headline: "Principal Engineer", summary: "s", experience: [], skillGroupOrder: [], coverNote: "", rationale: "" }, "claude");
    await chatAboutResumeWithClaude({ master: local, posting, doc, history: [], message: "Lead with the City of Towson work." });
    nextOutput = { answers: [] };
    await draftAnswersWithClaude({ master: local, posting, fit: null, questions: ["Tell us about your City of Towson work."] });

    const body = JSON.stringify(sent);
    expect(body).toContain("City of Towson, Digital Services");
    expect(body).toContain("towson-city-1");
    for (const v of ["jordan", "quill", "jordan.quill@example.com", "410-555-0199", "5550199", "towson, md", "linkedin.com/in/jquill"]) {
      expect(body.toLowerCase(), `request contained "${v}"`).not.toContain(v);
    }
  });
});
