import type { Prisma } from "@/generated/prisma/client";
import { APPLYING_VERDICTS, paceOf, type FitAnalysis, type FitVerdict, type Pace } from "@/lib/jobs/fit";
import type { BreakdownEntry } from "@/lib/jobs/scoring";
import type { WorkMode } from "@/lib/jobs/scoring-config";

/**
 * The job list's views, built around one question: is this worth applying
 * to? "To apply" holds matches Claude says to apply to plus ones it hasn't
 * read yet; everything ruled out (by a filter, by Claude, or by you) is under
 * "Not for me", each with its reason.
 */
export const VIEWS = {
  todo: { label: "To apply", blurb: "Jobs worth your time, best first: Claude's picks, then ones it hasn't read yet." },
  applied: { label: "Applied", blurb: "Shortlisted, applied, interviewing and offers." },
  notforme: { label: "Not for me", blurb: "Ruled out by a filter, by Claude, or by you. Each says why." },
  archived: { label: "Archived", blurb: "Hidden but kept, with their history." },
} as const;
export type View = keyof typeof VIEWS;

/** Older links (?view=matches and so on) still land somewhere sensible. */
const LEGACY_VIEWS: Record<string, View> = { matches: "todo", pipeline: "applied", filtered: "notforme", skipped: "notforme" };

export function parseView(v: string | undefined): View {
  if (v && v in VIEWS) return v as View;
  return (v && LEGACY_VIEWS[v]) || "todo";
}

/** Open postings that passed every filter and are still undecided. */
export const OPEN_MATCH: Prisma.JobPostingWhereInput = {
  archivedAt: null,
  closedAt: null,
  filterFailures: { isEmpty: true },
  status: { in: ["NEW", "SHORTLISTED"] },
};

/**
 * Claude reads a job without being asked only when it's remote: on opening
 * the job and from "Have Claude read the next few". Anything else waits for
 * "Evaluate" on its page.
 */
export const AUTO_EVALUATE_MODES: WorkMode[] = ["REMOTE"];
export const autoEvaluates = (workMode: string) => (AUTO_EVALUATE_MODES as string[]).includes(workMode);

/** Remote matches not evaluated yet: what "Have Claude read the next few" works through. */
export const UNEVALUATED_MATCH: Prisma.JobPostingWhereInput = { ...OPEN_MATCH, fitAnalyzedAt: null, workMode: { in: AUTO_EVALUATE_MODES } };

/** Which postings each view loads; "To apply" and "Not for me" then split matches by verdict (verdictBucket). */
export function viewWhere(view: View): Prisma.JobPostingWhereInput {
  switch (view) {
    case "todo":
      return OPEN_MATCH;
    case "applied":
      return { archivedAt: null, status: { in: ["SHORTLISTED", "APPLIED", "INTERVIEWING", "OFFER"] } };
    case "notforme":
      return {
        archivedAt: null,
        OR: [OPEN_MATCH, { status: "SKIPPED" }, { NOT: { filterFailures: { isEmpty: true } }, status: "NEW" }],
      };
    case "archived":
      return { archivedAt: { not: null } };
  }
}

type Triageable = {
  status: string;
  filterFailures: string[];
  closedAt: Date | null;
  fitAnalysis: unknown;
  score: number | null;
  scoreBreakdown: unknown;
};

/** Where an undecided posting belongs: worth applying to, or ruled out (and why). */
export function verdictBucket(p: Triageable): { bucket: "todo" | "notforme"; why: string | null } {
  if (p.status === "SKIPPED") return { bucket: "notforme", why: "You skipped it" };
  if (p.filterFailures.length) return { bucket: "notforme", why: p.filterFailures[0] };
  const fit = p.fitAnalysis as FitAnalysis | null;
  if (fit && !APPLYING_VERDICTS.includes(fit.verdict)) return { bucket: "notforme", why: fit.reason };
  return { bucket: "todo", why: null };
}

const VERDICT_RANK: Partial<Record<FitVerdict, number>> = { APPLY: 0, APPLY_LOW_EFFORT: 1 };
const PACE_POINTS: Record<Pace, number> = { CALM: 12, STEADY: 4, UNKNOWN: 0, INTENSE: -12 };

/**
 * "To apply" order: Claude's "Apply" first, then "Apply, low effort", then
 * jobs it hasn't read. Within each, the score (which already weighs pay and
 * scope) plus a nudge for a calm pace, since calm and well paid is the goal.
 */
export function triageKey(p: Triageable): number {
  const fit = p.fitAnalysis as FitAnalysis | null;
  const rank = fit ? (VERDICT_RANK[fit.verdict] ?? 3) : 2;
  const pace = paceOf(fit, (p.scoreBreakdown ?? []) as BreakdownEntry[]).rating;
  return rank * 1000 - ((p.score ?? 0) + PACE_POINTS[pace]);
}
