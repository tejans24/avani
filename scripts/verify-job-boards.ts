/**
 * Verify which contractors can be fetched as job boards, politely.
 *
 *   npx tsx scripts/verify-job-boards.ts [out.json] [--set contractors|mission|all]
 *     [--include-clearance-heavy]
 *     [--workday "Company=https://tenant.wd5.myworkdayjobs.com/Site" ...]
 *
 * For each company in src/lib/jobs/contractors.ts (regional gov contractors)
 * and/or src/lib/jobs/companies.ts (nationwide climate, health and civic
 * employers; --set, default all), tries its likely board ids
 * on the documented public job APIs (Greenhouse, Lever, Ashby,
 * SmartRecruiters), one request at a time with a pause between requests.
 * For Workday career sites passed with --workday (copy the URL from the
 * company's careers page), checks robots.txt for the jobs endpoint; if
 * robots.txt disallows it, the company stays capture-only.
 *
 * Prints a summary and writes the full report as JSON. Read-only: it never
 * writes to the database. Add the "feed" results as JobBoard rows afterwards.
 */
import { writeFileSync } from "node:fs";
import { candidateSlugs, chooseBoard, countPostings, probeUrl, type BoardVerdict, type ProbeSource } from "../src/lib/jobs/board-probe";
import { MISSION_EMPLOYERS } from "../src/lib/jobs/companies";
import { CONTRACTORS } from "../src/lib/jobs/contractors";
import { JOB_FINDER_USER_AGENT, isAllowed } from "../src/lib/jobs/robots";

const SOURCES: ProbeSource[] = ["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS"];
const PAUSE_MS = 400;
const headers = { "User-Agent": `${JOB_FINDER_USER_AGENT}/1.0 (personal job search; one request at a time)` };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: res.status, body: null };
    }
  } catch (e) {
    return { status: 0, body: String(e) };
  }
}

async function probeCompany(name: string): Promise<BoardVerdict> {
  const hits: { source: ProbeSource; slug: string; openPostings: number }[] = [];
  let networkErrors = 0;
  for (const source of SOURCES) {
    for (const slug of candidateSlugs(name)) {
      const { status, body } = await getJson(probeUrl(source, slug));
      await sleep(PAUSE_MS);
      if (status === 0 || status === 403 || status === 429) networkErrors++;
      const n = countPostings(source, status, body);
      if (n !== null) {
        hits.push({ source, slug, openPostings: n });
        break; // first matching slug per source is enough
      }
    }
  }
  if (!hits.length && networkErrors) return { status: "capture-only", reason: `Network errors (${networkErrors}); rerun` };
  return chooseBoard(hits);
}

async function checkWorkday(name: string, siteUrl: string): Promise<BoardVerdict> {
  const u = new URL(siteUrl);
  const tenant = u.hostname.split(".")[0];
  const site = u.pathname.split("/").filter(Boolean).pop() ?? "";
  const res = await fetch(`${u.origin}/robots.txt`, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res) return { status: "capture-only", reason: "robots.txt unreachable" };
  const robots = res.status === 200 ? await res.text() : "";
  const path = `/wday/cxs/${tenant}/${site}/jobs`;
  if (!isAllowed(robots, path)) return { status: "capture-only", reason: `robots.txt disallows ${path}` };
  return { status: "feed", source: "WORKDAY", slug: `${u.hostname}/${tenant}/${site}`, openPostings: -1 };
}

async function main() {
  const args = process.argv.slice(2);
  const out = args.find((a) => a.endsWith(".json")) ?? "job-boards-report.json";
  const includeCleared = args.includes("--include-clearance-heavy");
  const workday = new Map<string, string>();
  args.forEach((a, i) => {
    if (a === "--workday" && args[i + 1]) {
      const [n, url] = args[i + 1].split("=");
      workday.set(n.trim().toLowerCase(), url.trim());
    }
  });

  const setIdx = args.indexOf("--set");
  const set = setIdx >= 0 ? args[setIdx + 1] : "all";
  const names = [
    ...(set === "mission" ? [] : CONTRACTORS.filter((c) => includeCleared || !c.clearanceHeavy).map((c) => c.name)),
    ...(set === "contractors" ? [] : MISSION_EMPLOYERS.map((e) => e.name)),
  ];

  const report: { name: string; verdict: BoardVerdict }[] = [];
  for (const c of names.map((name) => ({ name }))) {
    const wd = workday.get(c.name.toLowerCase());
    const verdict = wd ? await checkWorkday(c.name, wd) : await probeCompany(c.name);
    report.push({ name: c.name, verdict });
    const v = verdict.status === "feed" ? `FEED  ${verdict.source}:${verdict.slug} (${verdict.openPostings} open)` : `capture-only: ${verdict.reason}`;
    console.log(`${c.name.padEnd(42)} ${v}`);
  }
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  const feeds = report.filter((r) => r.verdict.status === "feed").length;
  console.log(`\n${feeds} feeds, ${report.length - feeds} capture-only. Report: ${out}`);
}

main();
