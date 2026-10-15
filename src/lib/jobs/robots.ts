/**
 * robots.txt check: "is this site open to automated fetching of this path?"
 *
 * Used before adding any source that isn't a documented public job API
 * (e.g. a Workday career site). Documented job-board APIs (Greenhouse, Lever,
 * Ashby, SmartRecruiters) are published for exactly this use and don't need
 * it. Implements the parts of RFC 9309 that matter here: the group for our
 * user-agent (else "*"), Allow/Disallow with longest-match precedence, and
 * the "*" and "$" wildcards.
 *
 * Pure functions (unit-tested).
 */

export const JOB_FINDER_USER_AGENT = "AvaniJobFinder";

type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      // An empty Disallow means "allow everything"; skip it.
      if (value) current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith("$");
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const re = new RegExp(
    "^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : "")
  );
  return re.test(path);
}

/** True when `path` may be fetched by `userAgent` under these rules. */
export function isAllowed(robotsTxt: string, path: string, userAgent = JOB_FINDER_USER_AGENT): boolean {
  const groups = parseRobots(robotsTxt);
  const ua = userAgent.toLowerCase();
  const group =
    groups.find((g) => g.agents.some((a) => a !== "*" && ua.includes(a))) ?? groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    if (!ruleMatches(r.path, path)) continue;
    const len = r.path.length;
    // Longest match wins; on a tie, Allow wins (RFC 9309 §2.2.2).
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}
