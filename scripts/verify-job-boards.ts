/**
 * Verify which companies can be fetched as job boards, politely.
 *
 *   npx tsx scripts/verify-job-boards.ts [out.json] [--set contractors|mission|all]
 *     [--include-clearance-heavy] [--skip-workday] [--only "Name,Name"]
 *     [--workday "Company=https://tenant.wd5.myworkdayjobs.com/Site" ...]
 *     [--apply] [--apply-unconfirmed]
 *
 * For each company in src/lib/jobs/contractors.ts (regional gov contractors)
 * and/or src/lib/jobs/companies.ts (nationwide climate, health and civic
 * employers), one request at a time with a pause between requests:
 *   1. tries its likely board ids on the documented public job APIs
 *      (Greenhouse, Lever, Ashby, SmartRecruiters);
 *   2. if none answers, looks for a Workday career site (common tenant/site
 *      patterns, or the URL passed with --workday) and accepts it only when
 *      the site's robots.txt allows the jobs endpoint.
 *
 * A hit is "confirmed" when the board states a company name that matches, or
 * (when a source states none) the id is the company's full name. Partial ids
 * (first word, acronym) can belong to someone else ("general" is not GDIT),
 * so they are reported for review and only added with --apply-unconfirmed.
 *
 * Writes the full report as JSON. --apply upserts confirmed feeds as enabled
 * JobBoard rows (DATABASE_URL required).
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import {
  boardNameUrl,
  chooseBoard,
  countPostings,
  extractBoardName,
  judgeHit,
  probeUrl,
  slugCandidates,
  workdayCandidates,
  type BoardVerdict,
  type ProbeSource,
  type SlugKind,
} from "../src/lib/jobs/board-probe";
import { MISSION_EMPLOYERS } from "../src/lib/jobs/companies";
import { CONTRACTORS } from "../src/lib/jobs/contractors";
import { JOB_FINDER_USER_AGENT, isAllowed } from "../src/lib/jobs/robots";

const SOURCES: ProbeSource[] = ["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS"];
const PAUSE_MS = 400;
const headers = { "User-Agent": `${JOB_FINDER_USER_AGENT}/1.0 (personal job search; one request at a time)`, Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(url: string, init?: { method?: string; body?: unknown }): Promise<{ status: number; body: unknown; text: string }> {
  await sleep(PAUSE_MS);
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: { ...headers, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text), text };
    } catch {
      return { status: res.status, body: null, text };
    }
  } catch (e) {
    return { status: 0, body: String(e), text: "" };
  }
}

type Hit = { source: ProbeSource | "WORKDAY"; slug: string; openPostings: number; confirmed: boolean; why: string };
type Blocked = { blocked: string };
const isBlocked = (x: Hit | Blocked): x is Blocked => "blocked" in x;

async function probeApis(name: string): Promise<{ hits: Hit[]; networkErrors: number }> {
  const hits: Hit[] = [];
  let networkErrors = 0;
  for (const source of SOURCES) {
    for (const { slug, kind } of slugCandidates(name)) {
      const res = await request(probeUrl(source, slug));
      if (res.status === 0 || res.status === 403 || res.status === 429) networkErrors++;
      const n = countPostings(source, res.status, res.body);
      if (n === null) continue;
      let boardName = extractBoardName(source, res.body);
      const nameUrl = boardNameUrl(source, slug);
      if (!boardName && nameUrl) boardName = extractBoardName(source, (await request(nameUrl)).body);
      const verdict = judgeHit(name, kind, boardName);
      hits.push({ source, slug, openPostings: n, ...verdict });
      if (verdict.confirmed) break; // a confirmed id is enough for this source
    }
  }
  return { hits, networkErrors };
}

async function robotsAllow(host: string, tenant: string, site: string): Promise<boolean> {
  const res = await request(`https://${host}/robots.txt`);
  const robots = res.status === 200 ? res.text : "";
  return isAllowed(robots, `/wday/cxs/${tenant}/${site}/jobs`);
}

async function probeWorkday(name: string, explicit?: string): Promise<Hit | Blocked | null> {
  const candidates: { host: string; tenant: string; site: string; kind: SlugKind }[] = [];
  if (explicit) {
    const u = new URL(explicit);
    const tenant = u.hostname.split(".")[0];
    const site = u.pathname.split("/").filter((p) => p && !/^[a-z]{2}-[A-Z]{2}$/.test(p)).pop() ?? "External";
    candidates.push({ host: u.hostname, tenant, site, kind: "full" });
  } else {
    candidates.push(...workdayCandidates(name));
  }
  const deadHosts = new Set<string>();
  for (const c of candidates) {
    if (deadHosts.has(c.host)) continue;
    const res = await request(`https://${c.host}/wday/cxs/${c.tenant}/${c.site}/jobs`, {
      method: "POST",
      body: { appliedFacets: {}, limit: 1, offset: 0, searchText: "" },
    });
    if (res.status === 0) {
      deadHosts.add(c.host); // tenant doesn't exist on this Workday cluster
      continue;
    }
    const total = (res.body as { total?: unknown } | null)?.total;
    if (res.status !== 200 || typeof total !== "number") continue;
    if (!(await robotsAllow(c.host, c.tenant, c.site))) return { blocked: `robots.txt disallows ${c.host}/wday/cxs/${c.tenant}/${c.site}` };
    // Workday doesn't state a company name; a full-name tenant (or one you passed) is trusted.
    const verdict = judgeHit(name, explicit ? "full" : c.kind, null);
    return { source: "WORKDAY", slug: `${c.host}/${c.tenant}/${c.site}`, openPostings: total, confirmed: verdict.confirmed, why: verdict.why };
  }
  return null;
}

async function verify(name: string, opts: { skipWorkday: boolean; workdayUrl?: string }): Promise<BoardVerdict> {
  if (opts.workdayUrl) {
    const wd = await probeWorkday(name, opts.workdayUrl);
    if (wd && isBlocked(wd)) return { status: "capture-only", reason: wd.blocked };
    if (wd) return chooseBoard([wd as Hit]);
    return { status: "capture-only", reason: "The Workday URL you passed didn't answer" };
  }
  const { hits, networkErrors } = await probeApis(name);
  if (hits.some((h) => h.confirmed) || opts.skipWorkday) {
    if (!hits.length && networkErrors) return { status: "capture-only", reason: `Network errors (${networkErrors}); rerun` };
    return chooseBoard(hits);
  }
  const wd = await probeWorkday(name);
  if (wd && isBlocked(wd)) return hits.length ? chooseBoard(hits) : { status: "capture-only", reason: wd.blocked };
  if (wd) hits.push(wd as Hit);
  if (!hits.length && networkErrors) return { status: "capture-only", reason: `Network errors (${networkErrors}); rerun` };
  return chooseBoard(hits);
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const out = args.find((a) => a.endsWith(".json")) ?? "job-boards-report.json";
  const includeCleared = args.includes("--include-clearance-heavy");
  const skipWorkday = args.includes("--skip-workday");
  const set = flagValue(args, "--set") ?? "all";
  const only = flagValue(args, "--only")?.split(",").map((s) => s.trim().toLowerCase());
  const workday = new Map<string, string>();
  args.forEach((a, i) => {
    if (a === "--workday" && args[i + 1]) {
      const [n, url] = args[i + 1].split("=");
      workday.set(n.trim().toLowerCase(), url.trim());
    }
  });

  let names = [
    ...(set === "mission" ? [] : CONTRACTORS.filter((c) => includeCleared || !c.clearanceHeavy).map((c) => c.name)),
    ...(set === "contractors" ? [] : MISSION_EMPLOYERS.map((e) => e.name)),
  ];
  if (only) names = names.filter((n) => only.includes(n.toLowerCase()));

  const report: { name: string; verdict: BoardVerdict }[] = [];
  for (const name of names) {
    const verdict = await verify(name, { skipWorkday, workdayUrl: workday.get(name.toLowerCase()) });
    report.push({ name, verdict });
    const v =
      verdict.status === "feed"
        ? `${verdict.confirmed ? "FEED " : "CHECK"} ${verdict.source}:${verdict.slug} (${verdict.openPostings} open)${verdict.confirmed ? "" : `: ${verdict.why}`}`
        : `capture-only: ${verdict.reason}`;
    console.log(`${name.padEnd(42)} ${v}`);
  }
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  const feeds = report.filter((r) => r.verdict.status === "feed" && r.verdict.confirmed).length;
  const check = report.filter((r) => r.verdict.status === "feed" && !r.verdict.confirmed).length;
  console.log(`\n${feeds} confirmed feeds, ${check} to check (CHECK), ${report.length - feeds - check} capture-only. Report: ${out}`);

  if (args.includes("--apply") || args.includes("--apply-unconfirmed")) {
    const includeUnconfirmed = args.includes("--apply-unconfirmed");
    const { db } = await import("../src/lib/db");
    let applied = 0;
    for (const r of report) {
      if (r.verdict.status !== "feed" || (!r.verdict.confirmed && !includeUnconfirmed)) continue;
      const isWorkday = r.verdict.source === "WORKDAY";
      // Workday slugs are stored as host + "tenant/site".
      const [host, ...rest] = r.verdict.slug.split("/");
      const slug = isWorkday ? rest.join("/") : r.verdict.slug;
      await db.jobBoard.upsert({
        where: { source_slug: { source: r.verdict.source, slug } },
        create: { source: r.verdict.source, slug, host: isWorkday ? host : null, companyName: r.name },
        update: { companyName: r.name, host: isWorkday ? host : null, enabled: true },
      });
      applied++;
    }
    console.log(`Applied ${applied} board(s) to the database${includeUnconfirmed ? " (including unconfirmed)" : ""}.`);
    await db.$disconnect();
  }
}

main();
