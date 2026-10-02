import {
  BASE_SCORE,
  CATEGORY_CAPS,
  COMP_BANDS,
  COMP_MISSING_FLAG,
  DOMAIN_GAP_RULES,
  HARD_FILTERS,
  KNOWN_GOV_CONTRACTORS,
  LANE_PATTERNS,
  MISSION_LANES,
  MISSION_RULES,
  MISSION_UNCLEAR_FLAG,
  RED_FLAG_RULES,
  SCOPE_RULES,
  SCORING_VERSION,
  STACK_RULES,
  WORK_MODE_PATTERNS,
  WORK_RULES,
  type Category,
  type Lane,
  type Rule,
  type WorkMode,
} from "@/lib/jobs/scoring-config";

/**
 * Filters, scoring and lane classification for one posting. Reads only from
 * scoring-config.ts; pure (unit-tested). The refresh pipeline stores the
 * result on JobPosting (workMode, lane, filterFailures, score,
 * scoreBreakdown, scoreFlags, scoringVersion).
 */

export type ScoringInput = {
  title: string;
  descriptionText: string;
  location: string;
  companyName: string;
  source: string;
  postedAt: Date | null;
  compMinCents: number | null;
  compMaxCents: number | null;
  /** From the source when it states it (e.g. Workday remoteType). */
  workModeHint?: WorkMode | null;
  isStaffingAgency?: boolean;
  laneOverride?: Lane | null;
};

export type BreakdownEntry = {
  category: Category;
  rule: string;
  label: string;
  points: number;
  /** The text that triggered the rule, trimmed to a short window. */
  evidence: string;
};

export type ScoringResult = {
  workMode: WorkMode;
  lane: Lane;
  filterFailures: string[];
  score: number;
  breakdown: BreakdownEntry[];
  /** Per-category totals after caps (for the detail pane). */
  categoryTotals: Record<Category, number>;
  flags: string[];
  scoringVersion: number;
};

const DAY_MS = 86_400_000;
const REMOTE_LOCATION = /\b(remote|anywhere|telecommute|work from home)\b/i;

function evidence(text: string, re: RegExp): string | null {
  const m = new RegExp(re.source, re.flags.replace("g", "")).exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - 40);
  const end = Math.min(text.length, m.index + m[0].length + 40);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

const firstMatch = (patterns: RegExp[], text: string) => {
  for (const p of patterns) {
    const ev = evidence(text, p);
    if (ev) return ev;
  }
  return null;
};

export function classifyWorkMode(location: string, text: string, hint?: WorkMode | null): WorkMode {
  if (hint && hint !== "UNKNOWN") return hint;
  for (const group of WORK_MODE_PATTERNS) {
    if (group.patterns.some((p) => p.test(text))) return group.mode;
  }
  if (REMOTE_LOCATION.test(location)) return "REMOTE";
  return "UNKNOWN";
}

export function classifyLane(input: Pick<ScoringInput, "source" | "companyName" | "laneOverride">, text: string): Lane {
  if (input.laneOverride) return input.laneOverride;
  const company = input.companyName.toLowerCase();
  if (input.source === "USAJOBS" || KNOWN_GOV_CONTRACTORS.some((c) => company.includes(c))) return "GOV_CONTRACTOR";
  let best: Lane = "UNCLASSIFIED";
  let bestHits = 0;
  let tie = false;
  for (const [lane, patterns] of Object.entries(LANE_PATTERNS) as [Lane, RegExp[]][]) {
    const hits = patterns.reduce((n, p) => n + (text.match(new RegExp(p.source, "gi"))?.length ?? 0), 0);
    if (hits > bestHits) {
      best = lane;
      bestHits = hits;
      tie = false;
    } else if (hits === bestHits && hits > 0) {
      tie = true;
    }
  }
  return tie ? "UNCLASSIFIED" : best;
}

function hardFilters(input: ScoringInput, text: string, workMode: WorkMode, remoteLocation: boolean, now: Date): string[] {
  const out: string[] = [];
  const H = HARD_FILTERS;

  if (input.postedAt) {
    const days = Math.floor((now.getTime() - input.postedAt.getTime()) / DAY_MS);
    if (days > H.maxPostedAgeDays) out.push(`Posted ${days} days ago (limit ${H.maxPostedAgeDays})`);
  }

  if (!H.allowedWorkModes.includes(workMode)) {
    out.push(workMode === "HYBRID" ? "Regular hybrid (set in-office days)" : "On-site role");
  } else if (H.workModesNeedingCommute.includes(workMode) && !remoteLocation) {
    const loc = input.location.toLowerCase();
    if (!H.commutableLocations.some((c) => loc.includes(c))) out.push(`Office not within ~1 hr of Baltimore (${input.location})`);
  }

  const nonUs = firstMatch(H.nonUsPatterns, input.location);
  if (nonUs) out.push(`Not US-based (${input.location})`);

  const clearance = firstMatch(H.clearanceRejectPatterns, text);
  if (clearance && !H.clearanceAllowPatterns.some((p) => p.test(text))) out.push(`Clearance above Public Trust: ${clearance}`);

  if (input.isStaffingAgency) out.push("Staffing agency repost");
  else {
    const staffing = firstMatch(H.staffingAgencyPatterns, text);
    if (staffing) out.push(`Staffing agency repost: ${staffing}`);
  }

  if (input.compMaxCents !== null && input.compMaxCents < H.compFloorCents) {
    out.push(`Pay range entirely under $${H.compFloorCents / 100_000}K`);
  }

  const travel = firstMatch(H.travelRejectPatterns, text);
  if (travel) out.push(`Heavy travel: ${travel}`);

  const status = firstMatch(H.statusReportingRejectPatterns, text);
  if (status) out.push(`Daily status reporting: ${status}`);

  const cert = firstMatch(H.requiredCertRejectPatterns, text);
  if (cert && !H.requiredCertAllowPatterns.some((p) => p.test(text))) out.push(`Day-one certification required: ${cert}`);

  const anti = firstMatch(H.antiMissionPatterns, text);
  if (anti) out.push(`Outside your mission: ${anti}`);

  return out;
}

function applyRules(category: Category, rules: Rule[], text: string, into: BreakdownEntry[]) {
  for (const r of rules) {
    const ev = evidence(text, r.pattern);
    if (ev) into.push({ category, rule: r.id, label: r.label, points: r.points, evidence: ev });
  }
}

export function scorePosting(input: ScoringInput, now: Date = new Date()): ScoringResult {
  const text = `${input.title}\n${input.descriptionText}`;
  const remoteLocation = REMOTE_LOCATION.test(input.location);
  const flags: string[] = [];

  let workMode = classifyWorkMode(input.location, text, input.workModeHint);
  // A remote role with occasional trips to a distant office is remote with
  // travel, not a commute. Keep it, and say so.
  if (workMode === "OCCASIONAL_HYBRID" && remoteLocation) {
    workMode = "REMOTE";
    flags.push("Remote with occasional in-person travel");
  }
  if (workMode === "UNKNOWN") flags.push(HARD_FILTERS.workModeUnknownFlag);

  const lane = classifyLane(input, text);
  const filterFailures = hardFilters(input, text, workMode, remoteLocation, now);

  const breakdown: BreakdownEntry[] = [];

  // Comp: posted range midpoint.
  if (input.compMinCents !== null || input.compMaxCents !== null) {
    const lo = input.compMinCents ?? input.compMaxCents!;
    const hi = input.compMaxCents ?? input.compMinCents!;
    const mid = Math.round((lo + hi) / 2);
    const band = COMP_BANDS.find((b) => mid >= b.minCents)!;
    breakdown.push({
      category: "comp",
      rule: "comp-band",
      label: band.label,
      points: band.points,
      evidence: `$${Math.round(lo / 100_000)}K–$${Math.round(hi / 100_000)}K (midpoint $${Math.round(mid / 100_000)}K)`,
    });
  } else {
    flags.push(COMP_MISSING_FLAG);
  }

  applyRules("scope", SCOPE_RULES, text, breakdown);
  applyRules("mission", MISSION_RULES, text, breakdown);
  if (MISSION_LANES.includes(lane) && !breakdown.some((b) => b.category === "mission")) {
    breakdown.push({ category: "mission", rule: "mission-lane", label: `Mission lane (${lane})`, points: 6, evidence: input.companyName });
  }
  applyRules("work", WORK_RULES, text, breakdown);
  applyRules("stack", STACK_RULES, text, breakdown);
  applyRules("redFlags", RED_FLAG_RULES, text, breakdown);
  applyRules("redFlags", DOMAIN_GAP_RULES, text, breakdown);
  if (!breakdown.some((b) => b.category === "mission")) flags.push(MISSION_UNCLEAR_FLAG);

  const categoryTotals = {} as Record<Category, number>;
  for (const cat of Object.keys(CATEGORY_CAPS) as Category[]) {
    const raw = breakdown.filter((b) => b.category === cat).reduce((n, b) => n + b.points, 0);
    categoryTotals[cat] = Math.max(CATEGORY_CAPS[cat].min, Math.min(CATEGORY_CAPS[cat].max, raw));
  }
  const total = BASE_SCORE + Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  return {
    workMode,
    lane,
    filterFailures,
    score: Math.max(0, Math.min(100, total)),
    breakdown,
    categoryTotals,
    flags,
    scoringVersion: SCORING_VERSION,
  };
}
