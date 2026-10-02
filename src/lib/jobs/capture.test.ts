import { describe, expect, it } from "vitest";

import { canonicalJobUrl, companyFromHost, companyFromPlatformPath, findJobPosting, htmlToText, parseCapture } from "@/lib/jobs/capture";

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
    expect(draft.missing).toEqual(["title", "location"]);
    expect(draft).toMatchObject({ companyName: "Example", guessed: ["companyName"] });
  });

  it("reads a page with no JSON-LD from its heading, title and address", () => {
    const draft = parseCapture({
      url: "https://careers.icf.com/us/en/job/R2603278/Senior-Cloud-Architect-Remote",
      pageTitle: "Senior Cloud Architect (Remote) in Reston, Virginia | ICF Careers",
      meta: { h1: "Senior Cloud Architect (Remote)", siteName: "ICF Careers" },
      text: "Careers Home\nSenior Cloud Architect (Remote)\nDesign AWS platforms.",
    });
    expect(draft).toMatchObject({
      title: "Senior Cloud Architect",
      companyName: "ICF",
      location: "Remote",
      remote: true,
      missing: [],
      guessed: ["title", "companyName", "location"],
    });
  });

  it("prefers a careers platform's own job object (Phenom)", () => {
    const draft = parseCapture({
      url: "https://careers.icf.com/us/en/job/R1",
      pageTitle: "Job Details | ICF",
      meta: { h1: "Job Details" },
      text: "Job Details\nApply now",
      embedded: {
        title: "Data Engineer",
        cityStateCountry: "Reston, Virginia, United States",
        description: "<p>Build pipelines.</p>",
        postedDate: "2026-09-28",
      },
    });
    expect(draft).toMatchObject({
      title: "Data Engineer",
      companyName: "ICF",
      location: "Reston, Virginia, United States",
      remote: false,
      descriptionText: "Build pipelines.",
    });
    expect(draft.postedAt?.toISOString().slice(0, 10)).toBe("2026-09-28");
  });

  it("finds a Location line and skips generic headings", () => {
    const draft = parseCapture({
      url: "https://jobs.lever.co/acme/1",
      pageTitle: "Careers",
      meta: { h1: "Careers", ogTitle: "Acme Health - Platform Engineer" },
      text: "Platform Engineer\nLocation: Baltimore, MD\nWe build things.",
    });
    expect(draft.title).toBe("Platform Engineer");
    expect(draft.companyName).toBe("Acme Health");
    expect(draft.location).toBe("Baltimore, MD");
  });

  it("splits a company-first page title (Workday style) the right way round", () => {
    const draft = parseCapture({
      url: "https://leidos.wd5.myworkdayjobs.com/External/job/Remote/Software-Architect_R-1",
      pageTitle: "Leidos - Software Architect",
      text: "Software Architect\nremote type\nFully Remote",
    });
    expect(draft).toMatchObject({ title: "Software Architect", companyName: "Leidos", location: "Remote" });
  });

  it("reads the pay range from the text when there's no structured pay", () => {
    const draft = parseCapture({
      url: "https://careers.eab.com/jobs/1",
      text:
        "Senior Engineer\nThe anticipated starting salary range for this role is $103,500 – $130,000 per year. Actual salary varies due to factors that may include but not be limited to relevant experience, skills, and location.",
    });
    expect(draft).toMatchObject({ compMinCents: 103_500_00, compMaxCents: 130_000_00 });
  });

  it("never guesses beyond structured data", () => {
    const draft = parseCapture({
      url: "https://x.example/job",
      meta: { h1: "Something Else" },
      jsonLd: [{ "@type": "JobPosting", title: "Engineer", hiringOrganization: { name: "Acme" }, jobLocation: { address: { addressLocality: "Towson", addressRegion: "MD" } } }],
    });
    expect(draft).toMatchObject({ title: "Engineer", companyName: "Acme", location: "Towson, MD", guessed: [] });
  });
});

describe("companyFromPlatformPath", () => {
  it("names the company from a board slug", () => {
    expect(companyFromPlatformPath("https://jobs.lever.co/acme-health/1")).toBe("Acme Health");
    expect(companyFromPlatformPath("https://careers.icf.com/x")).toBeUndefined();
  });
});

describe("companyFromHost", () => {
  it("uses the employer's domain, Workday tenants, and never a job platform", () => {
    expect(companyFromHost("https://careers.icf.com/x")).toBe("ICF");
    expect(companyFromHost("https://jobs.boozallen.com/x")).toBe("Boozallen");
    expect(companyFromHost("https://leidos.wd5.myworkdayjobs.com/External/job/1")).toBe("Leidos");
    expect(companyFromHost("https://boards.greenhouse.io/acme/jobs/1")).toBeUndefined();
    expect(companyFromHost("https://www.linkedin.com/jobs/view/1/")).toBeUndefined();
  });
});
