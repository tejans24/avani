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
