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

function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|corp|corporation|co|ltd|the|pbc|group)\b\.?/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * How a candidate id relates to the company name. "full" ids are the whole
 * name; "partial" ids (first word, first two words, acronym) can belong to a
 * different company (GDIT → "general"), so they need the board's own name
 * to confirm.
 */
export type SlugKind = "full" | "partial";
export type SlugCandidate = { slug: string; kind: SlugKind };

/** Board ids to try, most likely first: "Nava PBC" → nava (full), … */
export function slugCandidates(name: string): SlugCandidate[] {
  const words = nameWords(name);
  const out: SlugCandidate[] = [
    { slug: words.join(""), kind: "full" },
    { slug: words.join("-"), kind: "full" },
  ];
  if (words.length > 2) {
    out.push({ slug: words.slice(0, 2).join(""), kind: "partial" }, { slug: words.slice(0, 2).join("-"), kind: "partial" });
  }
  if (words.length > 1) {
    out.push({ slug: words.map((w) => w[0]).join(""), kind: "partial" }, { slug: words[0], kind: "partial" });
  }
  const seen = new Set<string>();
  return out.filter((c) => c.slug.length >= 3 && !seen.has(c.slug) && seen.add(c.slug));
}

/** Plain list of ids (kept for callers that don't need the kind). */
export function candidateSlugs(name: string): string[] {
  return slugCandidates(name).map((c) => c.slug);
}

/** Where a source states the board's company name, if it does. */
export function boardNameUrl(source: ProbeSource, slug: string): string | null {
  return source === "GREENHOUSE" ? `https://boards-api.greenhouse.io/v1/boards/${slug}` : null;
}

/** The board's own company name from a probe or board-name response. */
export function extractBoardName(source: ProbeSource, body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (source === "GREENHOUSE" && typeof b.name === "string") return b.name;
  if (source === "SMARTRECRUITERS" && Array.isArray(b.content)) {
    const company = (b.content[0] as { company?: { name?: unknown } } | undefined)?.company?.name;
    return typeof company === "string" ? company : null;
  }
  return null;
}

/** "CACI" ~ "CACI International Inc"; "General Dynamics IT" !~ "General Assembly". */
export function namesMatch(company: string, boardName: string): boolean {
  const a = nameWords(company).join(" ");
  const b = nameWords(boardName).join(" ");
  if (!a || !b) return false;
  if (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `)) return true;
  const acronym = nameWords(company).map((w) => w[0]).join("");
  if (acronym.length >= 3 && (b === acronym || b.startsWith(`${acronym} `))) return true;
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared / Math.max(ta.size, tb.size) >= 0.6;
}

/**
 * Accept a probe hit? A stated board name must match; with no stated name,
 * only a full-name id is trusted.
 */
export function judgeHit(company: string, kind: SlugKind, boardName: string | null): { confirmed: boolean; why: string } {
  if (boardName) {
    return namesMatch(company, boardName)
      ? { confirmed: true, why: `board name "${boardName}" matches` }
      : { confirmed: false, why: `board belongs to "${boardName}"` };
  }
  return kind === "full"
    ? { confirmed: true, why: "board id is the full company name" }
    : { confirmed: false, why: "matched a partial id; the board doesn't state its company" };
}

// --- Workday discovery -----------------------------------------------------------

export const WORKDAY_HOSTS = ["wd1", "wd3", "wd5", "wd12"];

/** Tenant/site guesses for a company's Workday career site, most likely first. */
export function workdayCandidates(name: string): { host: string; tenant: string; site: string; kind: SlugKind }[] {
  const words = nameWords(name);
  const tenants: { tenant: string; kind: SlugKind }[] = [{ tenant: words.join(""), kind: "full" }];
  if (words.length > 1) {
    tenants.push({ tenant: words.map((w) => w[0]).join(""), kind: "partial" }, { tenant: words[0], kind: "partial" });
  }
  const out: { host: string; tenant: string; site: string; kind: SlugKind }[] = [];
  const seen = new Set<string>();
  for (const { tenant, kind } of tenants) {
    if (tenant.length < 3 || seen.has(tenant)) continue;
    seen.add(tenant);
    const cap = tenant[0].toUpperCase() + tenant.slice(1);
    for (const wd of WORKDAY_HOSTS) {
      for (const site of ["External", "Careers", cap, `${cap}_Careers`, "External_Careers"]) {
        out.push({ host: `${tenant}.${wd}.myworkdayjobs.com`, tenant, site, kind });
      }
    }
  }
  return out;
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
  | { status: "feed"; source: ProbeSource | "WORKDAY"; slug: string; openPostings: number; confirmed: boolean; why?: string }
  | { status: "capture-only"; reason: string };

/** Prefer confirmed hits, then the busiest board; ties go to probe order. */
export function chooseBoard(
  hits: { source: ProbeSource | "WORKDAY"; slug: string; openPostings: number; confirmed?: boolean; why?: string }[]
): BoardVerdict {
  if (!hits.length) return { status: "capture-only", reason: "No public job-board API found" };
  const pool = hits.some((h) => h.confirmed !== false) ? hits.filter((h) => h.confirmed !== false) : hits;
  const best = pool.reduce((a, b) => (b.openPostings > a.openPostings ? b : a));
  return { status: "feed", ...best, confirmed: best.confirmed !== false };
}
