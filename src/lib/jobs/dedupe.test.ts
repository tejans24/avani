import { describe, expect, it } from "vitest";

import {
  type ExistingIndex,
  canDeletePosting,
  dedupeKey,
  normalizeCompany,
  normalizeLocation,
  normalizeTitle,
  resolveBatch,
  resolveIncoming,
  sourceIdKey,
} from "@/lib/jobs/dedupe";

describe("normalizeTitle", () => {
  it("expands abbreviations and drops noise", () => {
    expect(normalizeTitle("Sr. Software Eng (Remote) - R12345")).toBe("senior software engineer");
    expect(normalizeTitle("Senior Software Engineer")).toBe("senior software engineer");
    expect(normalizeTitle("Senior Full-Stack Developer, Req ID: 48213")).toBe("senior fullstack developer");
    expect(normalizeTitle("Principal Engineer - Hybrid")).toBe("principal engineer");
  });

  it("keeps meaningful symbols", () => {
    expect(normalizeTitle("C# Engineer")).toBe("c# engineer");
  });
});

describe("normalizeCompany", () => {
  it("strips legal suffixes, 'The', and punctuation", () => {
    expect(normalizeCompany("The Booz Allen Hamilton, Inc.")).toBe("booz allen hamilton");
    expect(normalizeCompany("Nava PBC")).toBe("nava");
    expect(normalizeCompany("Ad Hoc LLC")).toBe("ad hoc");
    expect(normalizeCompany("AT&T")).toBe("at and t");
  });
});

describe("normalizeLocation", () => {
  it("collapses every remote variant", () => {
    for (const l of ["Remote", "Remote - US", "Baltimore, MD (Remote)", "Anywhere in the United States"]) {
      expect(normalizeLocation(l)).toBe("remote");
    }
  });

  it("abbreviates states and drops the country", () => {
    expect(normalizeLocation("Baltimore, Maryland, United States")).toBe("baltimore, md");
    expect(normalizeLocation("Baltimore, MD")).toBe("baltimore, md");
  });
});

describe("dedupeKey", () => {
  it("matches the same job across Greenhouse and a LinkedIn capture", () => {
    expect(dedupeKey({ title: "Senior Software Engineer", companyName: "Nava PBC", location: "Remote" })).toBe(
      dedupeKey({ title: "Sr. Software Engineer (Remote)", companyName: "Nava", location: "United States (Remote)" })
    );
  });

  it("keeps genuinely different jobs apart", () => {
    const a = dedupeKey({ title: "Senior Software Engineer", companyName: "Nava", location: "Remote" });
    expect(dedupeKey({ title: "Staff Software Engineer", companyName: "Nava", location: "Remote" })).not.toBe(a);
    expect(dedupeKey({ title: "Senior Software Engineer", companyName: "Ad Hoc", location: "Remote" })).not.toBe(a);
  });
});

const job = { source: "GREENHOUSE", sourceJobId: "123", title: "Senior Software Engineer", companyName: "Nava PBC", location: "Remote" };

function index(over: Partial<ExistingIndex> = {}): ExistingIndex {
  return {
    bySourceId: new Map(),
    byKey: new Map(),
    dismissedSourceIds: new Set(),
    dismissedKeys: new Set(),
    ...over,
  };
}

describe("resolveIncoming", () => {
  it("creates a never-seen posting", () => {
    expect(resolveIncoming(job, index()).action).toBe("create");
  });

  it("refreshes the same source + id", () => {
    const r = resolveIncoming(job, index({ bySourceId: new Map([[sourceIdKey("GREENHOUSE", "123"), "p1"]]) }));
    expect(r).toMatchObject({ action: "refresh", postingId: "p1" });
  });

  it("rejects a cross-source duplicate as an alias, never a new posting", () => {
    const capture = { ...job, source: "MANUAL", sourceJobId: "https://www.linkedin.com/jobs/view/9/", title: "Sr. Software Engineer" };
    const r = resolveIncoming(capture, index({ byKey: new Map([[dedupeKey(job), "p1"]]) }));
    expect(r).toMatchObject({ action: "alias", postingId: "p1" });
  });

  it("rejects a repost under a new id as an alias", () => {
    const repost = { ...job, sourceJobId: "456" };
    expect(resolveIncoming(repost, index({ byKey: new Map([[dedupeKey(job), "p1"]]) })).action).toBe("alias");
  });

  it("drops deleted postings, including reposts of them under a new id", () => {
    expect(resolveIncoming(job, index({ dismissedSourceIds: new Set([sourceIdKey("GREENHOUSE", "123")]) })).action).toBe(
      "dismissed"
    );
    expect(resolveIncoming({ ...job, sourceJobId: "999" }, index({ dismissedKeys: new Set([dedupeKey(job)]) })).action).toBe(
      "dismissed"
    );
  });
});

describe("resolveBatch", () => {
  it("creates the first of two duplicates in one refresh and aliases the second", () => {
    const out = resolveBatch([job, { ...job, source: "LEVER", sourceJobId: "abc" }], index());
    expect(out.map((o) => o.resolution.action)).toEqual(["create", "alias"]);
  });
});

describe("canDeletePosting", () => {
  it("allows deleting unapplied postings", () => {
    expect(canDeletePosting({ status: "NEW", appliedAt: null, appliedResumeId: null })).toBe(true);
    expect(canDeletePosting({ status: "SKIPPED", appliedAt: null, appliedResumeId: null })).toBe(true);
  });

  it("protects anything with an application on record (archive instead)", () => {
    expect(canDeletePosting({ status: "APPLIED", appliedAt: new Date(), appliedResumeId: "t1" })).toBe(false);
    expect(canDeletePosting({ status: "CLOSED", appliedAt: new Date(), appliedResumeId: null })).toBe(false);
  });
});
