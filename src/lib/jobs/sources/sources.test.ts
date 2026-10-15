import { afterEach, describe, expect, it } from "vitest";

import { passesTitlePrefilter } from "@/lib/jobs/scoring-config";
import { memoryFetchCtx } from "./http";
import { SOURCES } from "./index";
import { parsePostedOn } from "./workday";

const NOW = new Date("2026-10-02T12:00:00Z");
const opts = { titleFilter: passesTitlePrefilter };

describe("greenhouse", () => {
  it("normalizes postings, decodes HTML, parses pay from text, applies the title filter", async () => {
    const ctx = memoryFetchCtx(
      {
        "https://boards-api.greenhouse.io/v1/boards/navapbc/jobs?content=true": {
          jobs: [
            {
              id: 101,
              title: "Senior Software Engineer",
              absolute_url: "https://boards.greenhouse.io/navapbc/jobs/101",
              first_published: "2026-09-25T10:00:00Z",
              location: { name: "Remote (US)" },
              content: "&lt;p&gt;Build FHIR APIs.&lt;/p&gt;&lt;p&gt;Salary range: $185,000 - $215,000&lt;/p&gt;",
            },
            { id: 102, title: "Account Executive", absolute_url: "x", location: { name: "Remote" }, content: "" },
          ],
        },
      },
      NOW
    );
    const out = await SOURCES.GREENHOUSE.fetchBoard({ source: "GREENHOUSE", slug: "navapbc", companyName: "Nava PBC" }, ctx, opts);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sourceJobId: "101",
      companyName: "Nava PBC",
      location: "Remote (US)",
      descriptionText: "Build FHIR APIs.\nSalary range: $185,000 - $215,000",
      compMinCents: 185_000_00,
      compMaxCents: 215_000_00,
    });
    expect(out[0].postedAt?.toISOString()).toBe("2026-09-25T10:00:00.000Z");
  });

  it("throws on a failed fetch so the board's postings are not closed", async () => {
    await expect(
      SOURCES.GREENHOUSE.fetchBoard({ source: "GREENHOUSE", slug: "gone", companyName: "X" }, memoryFetchCtx({}), opts)
    ).rejects.toThrow(/HTTP 404/);
  });
});

describe("lever", () => {
  it("uses structured salary and workplace type", async () => {
    const ctx = memoryFetchCtx({
      "https://api.lever.co/v0/postings/acme?mode=json": [
        {
          id: "abc",
          text: "Staff Platform Engineer",
          hostedUrl: "https://jobs.lever.co/acme/abc",
          createdAt: 1790000000000,
          workplaceType: "remote",
          categories: { location: "United States" },
          descriptionPlain: "Own the platform.",
          lists: [{ text: "What you'll do", content: "<li>Design</li><li>Build</li>" }],
          salaryRange: { min: 90, max: 110, currency: "USD", interval: "per-hour-wage" },
        },
      ],
    });
    const [p] = await SOURCES.LEVER.fetchBoard({ source: "LEVER", slug: "acme", companyName: "Acme" }, ctx, opts);
    expect(p).toMatchObject({ workModeHint: "REMOTE", compMinCents: 187_200_00, compMaxCents: 228_800_00 });
    expect(p.descriptionText).toBe("Own the platform.\nWhat you'll do\n• Design\n• Build");
  });
});

describe("ashby", () => {
  it("reads compensation components and remote flags", async () => {
    const ctx = memoryFetchCtx({
      "https://api.ashbyhq.com/posting-api/job-board/watershed?includeCompensation=true": {
        jobs: [
          {
            id: "j1",
            title: "Senior Software Engineer, Data Platform",
            location: "Remote - US",
            isRemote: true,
            publishedAt: "2026-09-30T00:00:00Z",
            jobUrl: "https://jobs.ashbyhq.com/watershed/j1",
            descriptionPlain: "Measure emissions.",
            compensation: {
              summaryComponents: [
                { compensationType: "Salary", interval: "1 YEAR", currencyCode: "USD", minValue: 190000, maxValue: 230000 },
              ],
            },
          },
        ],
      },
    });
    const [p] = await SOURCES.ASHBY.fetchBoard({ source: "ASHBY", slug: "watershed", companyName: "Watershed" }, ctx, opts);
    expect(p).toMatchObject({ workModeHint: "REMOTE", compMinCents: 190_000_00, compMaxCents: 230_000_00, location: "Remote - US" });
  });
});

describe("smartrecruiters", () => {
  it("fetches details only for postings that pass the title filter", async () => {
    const base = "https://api.smartrecruiters.com/v1/companies/acme/postings";
    const ctx = memoryFetchCtx({
      [`${base}?limit=100&offset=0`]: {
        totalFound: 2,
        content: [
          { id: "1", name: "Senior Software Engineer", releasedDate: "2026-09-20T00:00:00Z", location: { remote: true } },
          { id: "2", name: "Sales Director", location: { city: "Austin", region: "TX" } },
        ],
      },
      [`${base}/1`]: { jobAd: { sections: { jobDescription: { text: "<p>Build things.</p>" } } } },
    });
    const out = await SOURCES.SMARTRECRUITERS.fetchBoard({ source: "SMARTRECRUITERS", slug: "acme", companyName: "Acme" }, ctx, opts);
    expect(out.map((p) => p.sourceJobId)).toEqual(["1"]);
    expect(out[0]).toMatchObject({ location: "Remote", workModeHint: "REMOTE", descriptionText: "Build things." });
    expect(ctx.calls).not.toContain(`${base}/2`);
  });
});

describe("workday", () => {
  it("searches, dedupes across terms, and fetches capped details", async () => {
    const api = "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External";
    const list = {
      total: 2,
      jobPostings: [
        { title: "Senior Software Engineer", externalPath: "/job/Remote/Senior-Software-Engineer_R1", locationsText: "Remote", postedOn: "Posted 3 Days Ago" },
        { title: "Mechanical Engineer", externalPath: "/job/X/Mech_R2", locationsText: "Baltimore, MD" },
      ],
    };
    const ctx = memoryFetchCtx(
      {
        [`POST ${api}/jobs`]: list,
        [`${api}/job/Remote/Senior-Software-Engineer_R1`]: {
          jobPostingInfo: {
            jobReqId: "R1",
            title: "Senior Software Engineer",
            jobDescription: "<p>Modernize CMS systems. Pay range $170,000 - $200,000 annually.</p>",
            location: "Remote",
            remoteType: "Fully Remote",
            externalUrl: "https://acme.wd5.myworkdayjobs.com/External/job/Remote/Senior-Software-Engineer_R1",
          },
        },
      },
      NOW
    );
    const out = await SOURCES.WORKDAY.fetchBoard(
      { source: "WORKDAY", slug: "acme.wd5.myworkdayjobs.com/acme/External", companyName: "Acme" },
      ctx,
      opts
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ sourceJobId: "R1", workModeHint: "REMOTE", compMinCents: 170_000_00, compMaxCents: 200_000_00 });
    expect(out[0].postedAt?.toISOString()).toBe("2026-09-29T12:00:00.000Z");
    // One detail fetch even though every search term returned the same row.
    expect(ctx.calls.filter((c) => c.endsWith("_R1"))).toHaveLength(1);
  });

  it("rejects a malformed board slug", async () => {
    await expect(SOURCES.WORKDAY.fetchBoard({ source: "WORKDAY", slug: "acme", companyName: "A" }, memoryFetchCtx({}), opts)).rejects.toThrow(
      /host\/tenant\/site/
    );
  });

  it("parses relative posted dates", () => {
    expect(parsePostedOn("Posted Today", NOW)).toEqual(NOW);
    expect(parsePostedOn("Posted 30+ Days Ago", NOW)?.toISOString()).toBe("2026-09-02T12:00:00.000Z");
  });
});

describe("usajobs", () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env = { ...prev };
  });

  it("normalizes agency postings with annual pay", async () => {
    process.env.USAJOBS_API_KEY = "k";
    process.env.USAJOBS_USER_AGENT = "owner@example.com";
    const ctx = memoryFetchCtx({
      "https://data.usajobs.gov/api/search?JobCategoryCode=2210&RemoteIndicator=True&ResultsPerPage=500": {
        SearchResult: {
          SearchResultItems: [
            {
              MatchedObjectId: "812345",
              MatchedObjectDescriptor: {
                PositionTitle: "IT Specialist (Software Engineer)",
                PositionURI: "https://www.usajobs.gov/job/812345",
                PositionLocationDisplay: "Anywhere in the U.S. (remote job)",
                OrganizationName: "Centers for Medicare & Medicaid Services",
                PublicationStartDate: "2026-09-28",
                PositionRemuneration: [{ MinimumRange: "163964", MaximumRange: "191900", RateIntervalCode: "PA" }],
                UserArea: { Details: { JobSummary: "Modernize Medicare systems.", MajorDuties: ["Design APIs"] } },
              },
            },
          ],
        },
      },
    });
    const [p] = await SOURCES.USAJOBS.fetchBoard(
      { source: "USAJOBS", slug: "JobCategoryCode=2210&RemoteIndicator=True", companyName: "USAJOBS" },
      ctx,
      opts
    );
    expect(p).toMatchObject({
      sourceJobId: "812345",
      companyName: "Centers for Medicare & Medicaid Services",
      workModeHint: "REMOTE",
      compMinCents: 163_964_00,
      compMaxCents: 191_900_00,
      descriptionText: "Modernize Medicare systems.\nDesign APIs",
    });
  });

  it("refuses to run live without credentials", async () => {
    delete process.env.USAJOBS_API_KEY;
    delete process.env.JOBS_SOURCE_MODE;
    await expect(SOURCES.USAJOBS.fetchBoard({ source: "USAJOBS", slug: "q=1", companyName: "U" }, memoryFetchCtx({}), opts)).rejects.toThrow(
      /USAJOBS_API_KEY/
    );
  });
});

describe("passesTitlePrefilter", () => {
  it("keeps engineering roles and drops unrelated ones", () => {
    expect(passesTitlePrefilter("Senior Software Engineer")).toBe(true);
    expect(passesTitlePrefilter("Solutions Architect")).toBe(true);
    expect(passesTitlePrefilter("IT Specialist (Software Engineer)")).toBe(true);
    expect(passesTitlePrefilter("Software Engineering Intern")).toBe(false);
    expect(passesTitlePrefilter("Mechanical Engineer")).toBe(false);
    expect(passesTitlePrefilter("Account Executive")).toBe(false);
  });
});
