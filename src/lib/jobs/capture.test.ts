import { describe, expect, it } from "vitest";

import { canonicalJobUrl, findJobPosting, htmlToText, parseCapture } from "@/lib/jobs/capture";

describe("canonicalJobUrl", () => {
  it("strips tracking params and fragments", () => {
    expect(
      canonicalJobUrl("https://Boards.Greenhouse.io/acme/jobs/123?gh_src=abc&utm_source=li&utm_medium=x#apply")
    ).toBe("https://boards.greenhouse.io/acme/jobs/123");
  });

  it("keeps meaningful params", () => {
    expect(canonicalJobUrl("https://jobs.example.com/view?id=42&trk=feed")).toBe(
      "https://jobs.example.com/view?id=42"
    );
  });

  it("turns a LinkedIn search link into the job's own page", () => {
    expect(
      canonicalJobUrl("https://www.linkedin.com/jobs/search/?currentJobId=3998877665&keywords=engineer")
    ).toBe("https://www.linkedin.com/jobs/view/3998877665/");
  });
});

describe("htmlToText", () => {
  it("keeps list and paragraph breaks and decodes entities", () => {
    expect(htmlToText("<p>Build APIs &amp; pipelines.</p><ul><li>AWS</li><li>Kafka</li></ul>")).toBe(
      "Build APIs & pipelines.\n• AWS\n• Kafka"
    );
  });
});

describe("findJobPosting", () => {
  it("finds a JobPosting nested in @graph and with an array @type", () => {
    const job = { "@type": ["JobPosting"], title: "Engineer" };
    expect(findJobPosting([{ "@type": "Organization" }, { "@graph": [{ "@type": "WebPage" }, job] }])).toBe(job);
  });
});

describe("parseCapture", () => {
  it("builds a full draft from JobPosting JSON-LD", () => {
    const draft = parseCapture({
      url: "https://www.linkedin.com/jobs/view/111/?trk=public_jobs",
      pageTitle: "Senior Software Engineer | Acme | LinkedIn",
      text: "page chrome …",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: "Senior Software Engineer",
          hiringOrganization: { "@type": "Organization", name: "Acme Health" },
          jobLocationType: "TELECOMMUTE",
          jobLocation: { address: { addressLocality: "Baltimore", addressRegion: "MD", addressCountry: "US" } },
          datePosted: "2026-09-25",
          description: "<p>Build FHIR APIs on AWS.</p>",
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "USD",
            value: { "@type": "QuantitativeValue", minValue: 185000, maxValue: 215000, unitText: "YEAR" },
          },
        },
      ],
    });
    expect(draft).toMatchObject({
      url: "https://www.linkedin.com/jobs/view/111/",
      sourceJobId: "https://www.linkedin.com/jobs/view/111/",
      title: "Senior Software Engineer",
      companyName: "Acme Health",
      location: "Baltimore, MD",
      remote: true,
      descriptionText: "Build FHIR APIs on AWS.",
      compMinCents: 185_000_00,
      compMaxCents: 215_000_00,
      missing: [],
    });
    expect(draft.postedAt?.toISOString().slice(0, 10)).toBe("2026-09-25");
  });

  it("annualizes hourly pay at 2080 hours", () => {
    const draft = parseCapture({
      url: "https://x.example/job",
      jsonLd: [{ "@type": "JobPosting", baseSalary: { currency: "USD", value: { value: 90, unitText: "HOUR" } } }],
    });
    expect(draft.compMinCents).toBe(187_200_00);
    expect(draft.compMaxCents).toBe(187_200_00);
  });

  it("ignores non-USD salaries", () => {
    const draft = parseCapture({
      url: "https://x.example/job",
      jsonLd: [{ "@type": "JobPosting", baseSalary: { currency: "CAD", value: { minValue: 150000, unitText: "YEAR" } } }],
    });
    expect(draft.compMinCents).toBeUndefined();
  });

  it("falls back to pasted text and lists what the owner must fill in", () => {
    const draft = parseCapture({ url: "https://careers.example.com/jobs/9", text: "  We are hiring a remote engineer.  " });
    expect(draft.descriptionText).toBe("We are hiring a remote engineer.");
    expect(draft.missing).toEqual(["title", "companyName", "location"]);
  });
});
