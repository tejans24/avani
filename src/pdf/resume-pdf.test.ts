import React from "react";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { resumeSchema } from "@/lib/jobs/resume-schema";
import { contactLines, ResumePdf, shortUrl } from "@/pdf/ResumePdf";
import { pdfPageCount } from "@/pdf/resume-render";

const base = {
  contact: {
    firstName: "Jordan",
    lastName: "Quill",
    email: "jordan.quill@example.com",
    phone: "(410) 555-0100",
    location: "Baltimore, MD",
    links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/jordan-quill-architect" }],
  },
  headline: "Principal Engineer",
  summary: "Engineer and architect.",
  skills: [{ group: "Cloud", text: "AWS Lambda, Terraform" }],
  experience: [
    {
      id: "a",
      title: "Principal Software Architect and Technical Lead",
      organization: "Mayor's Office of Information Technology, City of Baltimore",
      location: "Baltimore, MD",
      periods: [{ start: "2021-03", end: "2022-03" }, { start: "2024-07", end: null }],
      bullets: [{ id: "a1", text: "Built event-driven eligibility services on AWS Lambda.", skills: [] }],
    },
  ],
};

describe("résumé header", () => {
  it("keeps a short headline on the contact line, as in the owner's résumé", () => {
    const r = resumeSchema.parse(base);
    expect(contactLines(r)).toEqual({
      headline: null,
      items: [
        { text: "Principal Engineer" },
        { text: "Baltimore, MD" },
        { text: "(410) 555-0100" },
        { text: "jordan.quill@example.com", href: "mailto:jordan.quill@example.com" },
        { text: "linkedin.com/in/jordan-quill-architect", href: "https://www.linkedin.com/in/jordan-quill-architect" },
      ],
    });
  });

  it("gives a long headline (a posting's full title) its own line", () => {
    const r = resumeSchema.parse({ ...base, headline: "Senior Solution Architect / Engineer, Digital Modernization and Enterprise Cloud Infrastructure" });
    const lines = contactLines(r);
    expect(lines.headline).toMatch(/^Senior Solution Architect/);
    expect(lines.items[0]).toEqual({ text: "Baltimore, MD" });
  });

  it("renders long role titles and a long headline on one page", async () => {
    const r = resumeSchema.parse({ ...base, headline: "Senior Solution Architect / Engineer, Digital Modernization and Enterprise Cloud Infrastructure" });
    const buffer = await renderToBuffer(React.createElement(ResumePdf, { resume: r }) as never);
    expect(pdfPageCount(buffer)).toBe(1);
  });
});

describe("links under the name", () => {
  it("read short, and still lead to the full address", () => {
    expect(shortUrl("https://www.linkedin.com/in/jordan-quill/")).toBe("linkedin.com/in/jordan-quill");
    expect(shortUrl("http://jordanquill.dev/?utm_source=resume")).toBe("jordanquill.dev");
    expect(shortUrl("github.com/jquill")).toBe("github.com/jquill");
    const r = resumeSchema.parse({ ...base, contact: { ...base.contact, links: [{ label: "Site", url: "jordanquill.dev" }] } });
    expect(contactLines(r).items.at(-1)).toEqual({ text: "jordanquill.dev", href: "https://jordanquill.dev" });
  });
});
