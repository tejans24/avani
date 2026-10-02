import { z } from "zod";

import { HARD_FILTERS, PAY, payK, type WorkMode } from "@/lib/jobs/scoring-config";
import type { BreakdownEntry } from "@/lib/jobs/scoring";

/**
 * Fit analysis: the job posting evaluator (instructions in fit-prompt.ts).
 * Claude reads the posting and the résumé content; this file holds the pure
 * parts (unit-tested):
 *
 * - the output schema, which mirrors the evaluator's report layout,
 * - the location and pay checks done in code (LOCATION_CHECK; the owner's
 *   home city never goes into a request),
 * - checks on Claude's answer: quotes must be in the posting, cited résumé
 *   bullets must exist, and COVERED needs a bullet behind it.
 */

export const FIT_VERDICTS = ["APPLY", "APPLY_LOW_EFFORT", "WATCH", "SKIP", "GET_CERT_FIRST", "CLOSED"] as const;
export type FitVerdict = (typeof FIT_VERDICTS)[number];
export const FIT_VERDICT_LABEL: Record<FitVerdict, string> = {
  APPLY: "Apply",
  APPLY_LOW_EFFORT: "Apply, low effort",
  WATCH: "Watch",
  SKIP: "Skip",
  GET_CERT_FIRST: "Get cert first",
  CLOSED: "Closed",
};

export const SCREEN_ODDS = ["LIKELY", "BETTER_THAN_EVEN", "LONG_SHOT", "NA"] as const;
export const SCREEN_ODDS_LABEL: Record<(typeof SCREEN_ODDS)[number], string> = {
  LIKELY: "likely",
  BETTER_THAN_EVEN: "better than even",
  LONG_SHOT: "long shot",
  NA: "n/a",
};

export const fitOutputSchema = z.object({
  verdict: z.enum(FIT_VERDICTS),
  reason: z.string(),
  screenOdds: z.enum(SCREEN_ODDS),
  /** For APPLY: what decides the offer. For APPLY, LOW EFFORT: the fifteen-minute version. */
  verdictDetail: z.string(),
  /** For WATCH: search terms to alert on. */
  watchTerms: z.array(z.string()),
  /** For GET CERT FIRST: the fastest acceptable cert for this posting's wording. */
  certToGet: z.string(),
  gates: z.array(
    z.object({
      requirement: z.string(),
      status: z.enum(["PASS", "FAIL", "UNKNOWN"]),
      evidence: z.string(),
      likelyKnockout: z.boolean(),
    })
  ),
  realJob: z.object({
    shape: z.string(),
    /** Two or three sentences copied from the posting. */
    quotes: z.array(z.string()),
    tempo: z.array(z.string()),
  }),
  fitTable: z.array(
    z.object({
      item: z.string(),
      status: z.enum(["COVERED", "SKILLS_LIST_ONLY", "GAP", "STRETCH"]),
      evidence: z.string(),
      bulletIds: z.array(z.string()),
    })
  ),
  criteria: z.array(
    z.object({
      criterion: z.string(),
      kind: z.enum(["MUST_HAVE", "PREFERRED", "DEALBREAKER"]),
      met: z.enum(["MET", "NOT_MET", "UNKNOWN"]),
      evidence: z.string(),
    })
  ),
  pay: z.object({ actual: z.string(), formEntry: z.string(), askOnCall: z.string() }),
  tailoring: z
    .object({
      header: z.string(),
      summary: z.string(),
      skillsLead: z.array(z.string()),
      skillsAdd: z.array(z.string()),
      skillsCut: z.array(z.string()),
      bullets: z.array(z.string()),
      coverLetter: z.string(),
      honestyFlags: z.array(z.string()),
    })
    .nullable(),
  formFields: z.array(z.object({ field: z.string(), answer: z.string() })),
  next: z.array(z.string()),
});
export type FitOutput = z.infer<typeof fitOutputSchema>;

export type FitAnalysis = FitOutput & {
  /** Quotes in realJob.quotes not found in the posting text, by index. */
  unverifiedQuotes: number[];
  /** The app's own location and pay checks, shown beside the verdict. */
  codeChecks: CodeChecks;
  /** Notes from the checks on Claude's answer. */
  checks: string[];
  model: string;
  analyzedAt: string;
};

export type FitPostingFacts = {
  title: string;
  companyName: string;
  location: string;
  workMode: WorkMode;
  compMinCents: number | null;
  compMaxCents: number | null;
  postedAt: Date | null;
  url: string;
  filterFailures: string[];
  descriptionText: string;
};

type Check = { status: "PASS" | "FAIL" | "UNKNOWN" | "UNDER_TARGET"; note: string };
export type CodeChecks = { location: Check; pay: Check };

/** Location and pay, checked from the posting's data in code. */
export function codeChecks(p: FitPostingFacts): CodeChecks {
  const workFailure = p.filterFailures.find((f) => /hybrid|on-site|office not within|not us-based/i.test(f));
  // The commute filter's message names the home city; this note goes into the prompt, so it doesn't.
  const location: Check = workFailure
    ? { status: "FAIL", note: /office not within/i.test(workFailure) ? `Office outside commuting range (${p.location})` : workFailure }
    : p.workMode === "REMOTE"
      ? { status: "PASS", note: "Remote" }
      : p.workMode === "OCCASIONAL_HYBRID"
        ? { status: "PASS", note: "Occasional office days, office within commuting range" }
        : p.workMode === "UNKNOWN"
          ? { status: "UNKNOWN", note: "The posting doesn't say whether it's remote" }
          : { status: "PASS", note: `${p.workMode === "HYBRID" ? "Hybrid" : "On-site"}, office within commuting range` };

  const { compMinCents: lo, compMaxCents: hi } = p;
  const range = lo && hi ? (lo === hi ? payK(lo) : `${payK(lo)} to ${payK(hi)}`) : null;
  const floor = HARD_FILTERS.compFloorCents;
  const pay: Check =
    hi === null || lo === null
      ? { status: "UNKNOWN", note: "No pay range found in the posting's data" }
      : hi < floor
        ? { status: "FAIL", note: `${range}, entirely under the ${payK(floor)} floor` }
        : (lo + hi) / 2 >= PAY.targetMinCents
          ? { status: "PASS", note: `${range}, in or above the ${payK(PAY.targetMinCents)} to ${payK(PAY.targetMaxCents)} target` }
          : { status: "UNDER_TARGET", note: `${range}: above the ${payK(floor)} floor, middle of the range under the ${payK(PAY.targetMinCents)} target` };

  return { location, pay };
}

/** The LOCATION_CHECK block of the request. */
export function codeChecksForPrompt(c: CodeChecks): string {
  return `LOCATION_CHECK: ${c.location.status}. ${c.location.note}.\nPAY_CHECK (from the posting's structured data, may miss a program budget note): ${c.pay.status}. ${c.pay.note}.`;
}

/** POSTING metadata line(s) for the request. */
export function postingMetadata(p: FitPostingFacts): string {
  const host = (() => {
    try {
      return new URL(p.url).hostname;
    } catch {
      return "";
    }
  })();
  return [
    `Company: ${p.companyName}`,
    `Title: ${p.title}`,
    `Location: ${p.location}`,
    p.compMinCents && p.compMaxCents ? `Pay (parsed): ${payK(p.compMinCents)} to ${payK(p.compMaxCents)}` : "Pay (parsed): none found",
    p.postedAt ? `Posted: ${p.postedAt.toISOString().slice(0, 10)}` : "",
    host ? `Site: ${host}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/** A quote counts as found when each piece of it (split at ellipses) is in the posting. */
export function quoteInText(quote: string, text: string): boolean {
  const hay = norm(text);
  const pieces = norm(quote)
    .replace(/^["']|["']$/g, "")
    .split(/\s*(?:\.\.\.|…)\s*/)
    .filter((p) => p.length >= 8);
  return pieces.length > 0 && pieces.every((p) => hay.includes(p));
}

/** Every string in the answer, for the em dash check. */
function allStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(allStrings);
  if (v && typeof v === "object") return Object.values(v).flatMap(allStrings);
  return [];
}

/**
 * Check Claude's answer and attach the code checks. Cited bullet ids not in
 * the résumé are removed, and a COVERED row left with none becomes
 * SKILLS_LIST_ONLY; real-job quotes not in the posting are marked; a verdict
 * to apply despite a failed code check is called out.
 */
export function finalizeFit(
  out: FitOutput,
  ctx: { posting: FitPostingFacts; bulletIds: Set<string>; model: string; now: Date }
): FitAnalysis {
  const checks: string[] = [];
  const text = ctx.posting.descriptionText;

  let dropped = 0;
  let downgraded = 0;
  const fitTable = out.fitTable.map((row) => {
    const ids = row.bulletIds.filter((id) => ctx.bulletIds.has(id));
    dropped += row.bulletIds.length - ids.length;
    if (row.status === "COVERED" && ids.length === 0) {
      downgraded++;
      return { ...row, bulletIds: ids, status: "SKILLS_LIST_ONLY" as const };
    }
    return { ...row, bulletIds: ids };
  });
  if (dropped) checks.push(`Removed ${dropped} résumé reference(s) that don't match a bullet.`);
  if (downgraded) checks.push(`${downgraded} item(s) marked covered had no résumé bullet behind them, so they show as skills-list only.`);

  const unverifiedQuotes = out.realJob.quotes.flatMap((q, i) => (quoteInText(q, text) ? [] : [i]));
  if (unverifiedQuotes.length) checks.push(`${unverifiedQuotes.length} quote(s) aren't in the posting as written.`);

  const code = codeChecks(ctx.posting);
  const applying = out.verdict === "APPLY" || out.verdict === "APPLY_LOW_EFFORT";
  if (applying && code.pay.status === "FAIL") checks.push(`Check: ${code.pay.note}.`);
  if (applying && code.location.status === "FAIL") checks.push(`Check: ${code.location.note}.`);

  const dashes = allStrings(out).filter((s) => s.includes("—")).length;
  if (dashes) checks.push(`${dashes} field(s) contain an em dash. Don't copy those into an application as is.`);

  return {
    ...out,
    tailoring: applying ? out.tailoring : null,
    fitTable,
    unverifiedQuotes,
    codeChecks: code,
    checks,
    model: ctx.model,
    analyzedAt: ctx.now.toISOString(),
  };
}

/** TAILOR_MODE=fake (tests): a deterministic stand-in built from the code score. */
export function fakeFitOutput(p: FitPostingFacts, breakdown: BreakdownEntry[], bulletIds: string[]): FitOutput {
  const positive = breakdown.filter((b) => b.points > 0);
  const apply = p.filterFailures.length === 0;
  return {
    verdict: apply ? "APPLY" : "SKIP",
    reason: `Fake evaluation of ${p.title} at ${p.companyName}.`,
    screenOdds: apply ? "BETTER_THAN_EVEN" : "NA",
    verdictDetail: "",
    watchTerms: [],
    certToGet: "",
    gates: [{ requirement: "Location", status: apply ? "PASS" : "FAIL", evidence: p.location, likelyKnockout: !apply }],
    realJob: { shape: "Software developer / modernization", quotes: positive.slice(0, 2).map((b) => b.evidence), tempo: [] },
    fitTable: positive.slice(0, 2).map((b, i) => ({ item: b.label, status: "COVERED" as const, evidence: "", bulletIds: bulletIds.slice(i, i + 1) })),
    criteria: [{ criterion: "Whole-problem scope", kind: "MUST_HAVE", met: "UNKNOWN", evidence: "" }],
    pay: { actual: p.compMaxCents ? payK(p.compMaxCents) : "Not posted", formEntry: "", askOnCall: "" },
    tailoring: apply
      ? { header: p.title, summary: "Engineer variant.", skillsLead: [], skillsAdd: [], skillsCut: [], bullets: [], coverLetter: "Not needed.", honestyFlags: [] }
      : null,
    formFields: [],
    next: ["Submit."],
  };
}
