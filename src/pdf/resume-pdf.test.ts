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
        { text: "LinkedIn", href: "https://www.linkedin.com/in/jordan-quill-architect" },
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
  it("show their label (\"LinkedIn\"), or the short address when there's no label, and lead to the full address", () => {
    expect(shortUrl("https://www.linkedin.com/in/jordan-quill/")).toBe("linkedin.com/in/jordan-quill");
    expect(shortUrl("http://jordanquill.dev/?utm_source=resume")).toBe("jordanquill.dev");
    expect(shortUrl("github.com/jquill")).toBe("github.com/jquill");
    const r = resumeSchema.parse({ ...base, contact: { ...base.contact, links: [{ label: "", url: "jordanquill.dev" }] } });
    expect(contactLines(r).items.at(-1)).toEqual({ text: "jordanquill.dev", href: "https://jordanquill.dev" });
  });
});

describe("roles with no bullets", () => {
  it("render as compact lines under Earlier experience, and the résumé still fits", async () => {
    const r = resumeSchema.parse({
      ...base,
      experience: [
        ...base.experience,
        { id: "b", title: "Engineer", organization: "Old Co", periods: [{ start: "2012-01", end: "2014-06" }], bullets: [{ id: "b1", text: "x", skills: [] }] },
      ],
    });
    // Tailoring left the older role with no bullets.
    const trimmed = { ...r, experience: [r.experience[0], { ...r.experience[1], bullets: [] }] };
    const buffer = await renderToBuffer(React.createElement(ResumePdf, { resume: trimmed }) as never);
    expect(pdfPageCount(buffer)).toBe(1);
  });
});

describe("one line under the name", () => {
  it("leaves the link off before splitting the line, and keeps it when there's room", () => {
    const busy = resumeSchema.parse({
      ...base,
      headline: "Principal Engineer and Architect",
      contact: { ...base.contact, email: "jordan.quill.solutions.architect@example.com", citizenship: "U.S. Citizen", links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/jq" }] },
    });
    // Headline, location, phone, a long email and citizenship fit together, but not with the link too.
    const lines = contactLines(busy);
    expect(lines.headline).toBeNull();
    expect(lines.items.map((i) => i.text)).not.toContain("LinkedIn");
    expect(lines.items.map((i) => i.text)).toContain("jordan.quill.solutions.architect@example.com");

    const roomy = resumeSchema.parse({ ...busy, contact: { ...busy.contact, email: "jq@example.com", citizenship: undefined } });
    expect(contactLines(roomy).items.map((i) => i.text)).toContain("LinkedIn");
  });
});
