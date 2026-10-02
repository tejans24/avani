import { describe, expect, it } from "vitest";

import {
  PersonalDataLeakError,
  assertNoPersonalData,
  buildTailoringPayload,
  scrubPersonal,
  serializeForAi,
} from "@/lib/jobs/ai-payload";
import { resumeSchema } from "@/lib/jobs/resume-schema";

const master = resumeSchema.parse({
  contact: {
    firstName: "Jordan",
    lastName: "Quill",
    email: "jordan.quill@example.com",
    phone: "(410) 555-0142",
    location: "Baltimore, MD",
    citizenship: "U.S. Citizen",
    links: [{ label: "GitHub", url: "https://github.com/jquill-dev" }],
  },
  headline: "Principal Engineer",
  summary: "Senior engineer building event-driven systems on AWS.",
  experience: [
    {
      id: "acme",
      organization: "Acme Health",
      title: "Senior Software Engineer",
      location: "Towson, MD",
      periods: [{ start: "2021-03", end: null }],
      bullets: [
        { id: "acme-1", text: "Built a FHIR intake API on Lambda.", skills: ["fhir"] },
        { id: "acme-2", text: "Wrote the runbook (contact Jordan Quill, 410-555-0142).", skills: [], reserve: true },
      ],
    },
  ],
  skills: [{ group: "Cloud", text: "AWS (Lambda, API Gateway)" }],
  education: [{ id: "umd", text: "B.S. Computer Science, University of Maryland" }],
  stories: [{ id: "s1", title: "Cutover", text: "Emailed jordan.quill@example.com updates hourly.", skills: [] }],
});

const posting = {
  title: "Senior Engineer",
  company: "Nava",
  lane: "GOV_CONTRACTOR",
  description: "Build on AWS. Hybrid option near Baltimore, MD.",
};

describe("buildTailoringPayload", () => {
  const payload = buildTailoringPayload({ master, posting, tailoringNotes: "Ping me at github.com/jquill-dev" });
  const body = JSON.stringify(payload);

  it("never includes the contact block or per-role locations", () => {
    expect(payload).not.toHaveProperty("contact");
    expect(body).not.toContain("Towson");
    expect(body).not.toContain("Baltimore");
  });

  it("leaves out education and the citizenship line", () => {
    expect(body).not.toContain("University of Maryland");
    expect(body).not.toContain("U.S. Citizen");
  });

  it("scrubs the posting too, so a posting naming the owner's city still sends", () => {
    expect(payload.posting.description).toBe("Build on AWS. Hybrid option near [redacted].");
  });

  it("keeps the résumé content and bullet ids tailoring needs", () => {
    expect(payload.experience[0].bullets.map((b) => b.id)).toEqual(["acme-1", "acme-2"]);
    expect(payload.experience[0].bullets[0].text).toBe("Built a FHIR intake API on Lambda.");
    expect(payload.experience[0].bullets[1].reserve).toBe(true);
  });

  it("scrubs personal values that appear inside free text", () => {
    expect(payload.experience[0].bullets[1].text).toBe("Wrote the runbook (contact [redacted], [phone]).");
    expect(payload.stories[0].text).toBe("Emailed [email] updates hourly.");
    expect(payload.tailoringNotes).toBe("Ping me at [redacted]");
    expect(() => serializeForAi(payload, master.contact)).not.toThrow();
  });
});

describe("scrubPersonal", () => {
  it("catches names case-insensitively, whole word only", () => {
    expect(scrubPersonal("JORDAN led it; quillfeather is a library.", master.contact)).toBe(
      "[redacted] led it; quillfeather is a library."
    );
  });
});

describe("assertNoPersonalData", () => {
  it("refuses a request that still contains a personal value, without echoing it", () => {
    let err: unknown;
    try {
      assertNoPersonalData(JSON.stringify({ x: "reach me at jordan.quill@example.com" }), master.contact);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PersonalDataLeakError);
    expect(String(err)).not.toContain("jordan");
  });

  it("catches a phone number written without punctuation", () => {
    expect(() => assertNoPersonalData('{"t":"call 5550142"}', master.contact)).toThrow(PersonalDataLeakError);
  });
});
