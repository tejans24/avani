import type { Lane, WorkMode } from "@/lib/jobs/scoring-config";

/** Labels and formatting for the jobs UI. Pure. */

export const LANE_LABEL: Record<Lane, string> = {
  GOV_CONTRACTOR: "Gov contractor",
  COMMERCIAL_PLATFORM: "Commercial platform",
  HEALTH_SYSTEM: "Health",
  CLIMATE_CONSERVATION: "Climate",
  INTERNAL_TOOLS: "Internal tools",
  UNCLASSIFIED: "Unclassified",
};

export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  REMOTE: "Remote",
  OCCASIONAL_HYBRID: "Occasional hybrid",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
  UNKNOWN: "Not stated",
};

export const SOURCE_LABEL: Record<string, string> = {
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  SMARTRECRUITERS: "SmartRecruiters",
  WORKDAY: "Workday",
  USAJOBS: "USAJOBS",
  CLIMATEBASE: "Climatebase",
  TECH_JOBS_FOR_GOOD: "Tech Jobs for Good",
  MANUAL: "Added by you",
};

export const CATEGORY_LABEL: Record<string, string> = {
  scope: "Scope & design authority",
  mission: "Mission",
  comp: "Pay",
  work: "Kind of work",
  stack: "Stack",
  redFlags: "Red flags",
};

/** "$185K–$215K", "$190K", or null. */
export function formatComp(minCents: number | null, maxCents: number | null): string | null {
  if (minCents === null && maxCents === null) return null;
  const k = (c: number) => `$${Math.round(c / 100_000)}K`;
  const lo = minCents ?? maxCents!;
  const hi = maxCents ?? minCents!;
  return lo === hi ? k(lo) : `${k(lo)}–${k(hi)}`;
}

export function scoreTone(score: number | null, passed: boolean): "positive" | "caution" | "neutral" | "critical" {
  if (!passed) return "critical";
  if (score === null) return "neutral";
  if (score >= 75) return "positive";
  if (score >= 55) return "caution";
  return "neutral";
}

/** "today", "3d ago", "5w ago". */
export function ago(d: Date | null, now = new Date()): string {
  if (!d) return "—";
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "5 days ago", then the date: for things you made (résumé versions). */
export function madeAgo(d: Date, now = new Date()): string {
  const min = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

const SITE_NAMES: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)indeed\.com$/, "Indeed"],
  [/(^|\.)glassdoor\.com$/, "Glassdoor"],
  [/(^|\.)ziprecruiter\.com$/, "ZipRecruiter"],
  [/(^|\.)dice\.com$/, "Dice"],
  [/(^|\.)builtin\.com$/, "Built In"],
  [/(^|\.)wellfound\.com$/, "Wellfound"],
  [/(^|\.)usajobs\.gov$/, "USAJOBS"],
  [/(^|\.)climatebase\.org$/, "Climatebase"],
  [/(^|\.)greenhouse\.io$/, "Greenhouse"],
  [/(^|\.)lever\.co$/, "Lever"],
  [/(^|\.)ashbyhq\.com$/, "Ashby"],
  [/(^|\.)myworkdayjobs\.com$/, "Workday"],
  [/(^|\.)smartrecruiters\.com$/, "SmartRecruiters"],
  [/(^|\.)icims\.com$/, "iCIMS"],
];

const VIA_LABEL: Record<string, string> = {
  bookmarklet: "the Add to Avani button",
  share: "phone share",
  shortcut: "iPhone Shortcut",
  paste: "pasted text",
};

/** Where a job was found: the site for jobs you added, the feed otherwise. */
export function postingSiteLabel(p: { source: string; url: string }): string {
  if (p.source !== "MANUAL") return SOURCE_LABEL[p.source] ?? p.source;
  let host: string;
  try {
    host = new URL(p.url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return SOURCE_LABEL.MANUAL;
  }
  return SITE_NAMES.find(([re]) => re.test(host))?.[1] ?? host;
}

/** "Added by you from careers.eab.com with the Add to Avani button". */
export function postingSourceText(p: { source: string; url: string; capturedVia: string | null }): string {
  if (p.source !== "MANUAL") return `From ${SOURCE_LABEL[p.source] ?? p.source}`;
  const via = p.capturedVia ? VIA_LABEL[p.capturedVia] : undefined;
  return `Added by you from ${postingSiteLabel(p)}${via ? ` with ${via}` : ""}`;
}
