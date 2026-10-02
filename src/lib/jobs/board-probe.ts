/**
 * Job-system discovery for a company: which documented public job API (if
 * any) it posts through, and its board id there. Pure parts only (unit-
 * tested); scripts/verify-job-boards.ts does the fetching.
 *
 * Policy: a company becomes a JobBoard only if
 *   - it answers on a documented public job-board API (Greenhouse, Lever,
 *     Ashby, SmartRecruiters), which is published for this use; or
 *   - it is a Workday career site whose robots.txt allows the jobs endpoint
 *     (checked with robots.ts).
 * Everything else is "capture only" (browser bookmarklet / share / paste).
 */

export type ProbeSource = "GREENHOUSE" | "LEVER" | "ASHBY" | "SMARTRECRUITERS";

/** Board ids to try, most likely first: "Nava PBC" → navapbc, nava-pbc, nava. */
export function candidateSlugs(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|corp|corporation|co|ltd|the)\b\.?/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const out = [words.join(""), words.join("-"), words[0]];
  if (words.length > 2) out.push(words.slice(0, 2).join(""), words.slice(0, 2).join("-"));
  return [...new Set(out)].filter((s) => s.length >= 3);
}

export function probeUrl(source: ProbeSource, slug: string): string {
  switch (source) {
    case "GREENHOUSE":
      return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
    case "LEVER":
      return `https://api.lever.co/v0/postings/${slug}?mode=json`;
    case "ASHBY":
      return `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
    case "SMARTRECRUITERS":
      return `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`;
  }
}

/** Number of open postings in a probe response, or null if it isn't a board. */
export function countPostings(source: ProbeSource, status: number, body: unknown): number | null {
  if (status !== 200 || body === null || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  switch (source) {
    case "GREENHOUSE":
      return Array.isArray(b.jobs) ? b.jobs.length : null;
    case "LEVER":
      return Array.isArray(body) ? body.length : null;
    case "ASHBY":
      return Array.isArray(b.jobs) ? b.jobs.length : null;
    case "SMARTRECRUITERS":
      // Unknown companies return 200 with an empty list, so require postings.
      return typeof b.totalFound === "number" && b.totalFound > 0 ? b.totalFound : null;
  }
}

export type BoardVerdict =
  | { status: "feed"; source: ProbeSource | "WORKDAY"; slug: string; openPostings: number }
  | { status: "capture-only"; reason: string };

/** Pick the board with the most open postings; ties go to probe order. */
export function chooseBoard(
  hits: { source: ProbeSource; slug: string; openPostings: number }[]
): BoardVerdict {
  if (!hits.length) return { status: "capture-only", reason: "No public job-board API found" };
  const best = hits.reduce((a, b) => (b.openPostings > a.openPostings ? b : a));
  return { status: "feed", ...best };
}
