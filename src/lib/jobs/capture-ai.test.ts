import { afterEach, describe, expect, it } from "vitest";

import { checkExtract, extractJobWithClaude, groundedShare, type CaptureExtract } from "@/lib/jobs/capture-ai";

const PAGE = `Skip to main content Careers Home Search jobs
Senior Cloud Architect (Remote)
Example Federal · Remote, United States · Posted 3 days ago
Design and build AWS platforms end-to-end for federal health programs.
Requirements: 8+ years with AWS, Terraform, and event-driven systems.
Pay range: $170,000 - $205,000.
Similar jobs  Cookie settings  © 2026 Example Federal`;

const fields = (over: Partial<CaptureExtract> = {}): CaptureExtract => ({
  isJobPosting: true,
  title: "Senior Cloud Architect (Remote)",
  companyName: "Example Federal",
  location: "Remote, United States",
  workMode: "REMOTE",
  payMin: 170000,
  payMax: 205000,
  postedOn: "",
  descriptionText:
    "Design and build AWS platforms end-to-end for federal health programs.\nRequirements: 8+ years with AWS, Terraform, and event-driven systems.\nPay range: $170,000 - $205,000.",
  ...over,
});

describe("groundedShare", () => {
  it("is 1 for text copied from the page and low for invented text", () => {
    expect(groundedShare(fields().descriptionText, PAGE)).toBe(1);
    expect(groundedShare("Lead a team of 40 Kubernetes engineers at a Fortune 500 bank.", PAGE)).toBeLessThan(0.5);
  });
});

describe("checkExtract", () => {
  it("passes a faithful extraction", () => {
    expect(checkExtract(fields(), PAGE)).toEqual([]);
  });

  it("flags an invented description, a title not on the page, reversed pay, and non-postings", () => {
    const w = checkExtract(
      fields({ isJobPosting: false, title: "Chief Cloud Officer", payMin: 205000, payMax: 170000, descriptionText: "Lead a team of 40 Kubernetes engineers." }),
      PAGE
    );
    expect(w).toHaveLength(4);
  });
});

describe("extractJobWithClaude (fake mode)", () => {
  const prev = process.env.TAILOR_MODE;
  afterEach(() => {
    process.env.TAILOR_MODE = prev;
  });

  it("scrubs the owner's details from the page before anything else", async () => {
    process.env.TAILOR_MODE = "fake";
    const r = await extractJobWithClaude({
      pageTitle: "Senior Cloud Architect | Example Federal",
      text: `Signed in as Jordan Quill\n${PAGE}`,
      contact: { firstName: "Jordan", lastName: "Quill", email: "j@example.com", links: [] },
    });
    expect(r.fields.descriptionText).not.toContain("Jordan");
    expect(r.fields).toMatchObject({ title: "Senior Cloud Architect", companyName: "Example Federal", workMode: "REMOTE" });
  });

  it("puts the owner's city back into a local job's location, after the model", async () => {
    process.env.TAILOR_MODE = "fake";
    const r = await extractJobWithClaude({
      pageTitle: "Data Engineer | Example Health",
      text: "Data Engineer\nExample Health\nTowson, MD (hybrid)\nBuild pipelines for hospital data, end to end.",
      contact: { firstName: "Jordan", lastName: "Quill", email: "j@example.com", location: "Towson, MD", links: [] },
    });
    expect(r.fields.descriptionText).not.toContain("Towson");
    expect(r.fields.location).not.toContain("[redacted]");
  });
});
