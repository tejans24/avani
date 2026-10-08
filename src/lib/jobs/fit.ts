import { z } from "zod";

import { HARD_FILTERS, PAY, payK, type WorkMode } from "@/lib/jobs/scoring-config";
import type { Resume } from "@/lib/jobs/resume-schema";
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

/** How intense the day to day is: the owner wants calm and well paid. */
export const PACES = ["CALM", "STEADY", "INTENSE", "UNKNOWN"] as const;
export type Pace = (typeof PACES)[number];
export const PACE_LABEL: Record<Pace, string> = { CALM: "Calm", STEADY: "Steady", INTENSE: "Intense", UNKNOWN: "Pace unclear" };

/** Verdicts that mean "put time into this one". */
export const APPLYING_VERDICTS: readonly FitVerdict[] = ["APPLY", "APPLY_LOW_EFFORT"];

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
  /** Day-to-day intensity, from the posting's tempo signals. */
  pace: z.object({ rating: z.enum(PACES), why: z.string() }),
  /** Whether this application needs a cover letter at all. */
  coverLetter: z.object({ needed: z.boolean(), why: z.string() }),
});
export type FitOutput = z.infer<typeof fitOutputSchema>;

/** Analyses saved before pace and coverLetter existed lack them. */
export type FitAnalysis = Omit<FitOutput, "pace" | "coverLetter"> &
  Partial<Pick<FitOutput, "pace" | "coverLetter">> & {
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
export type CodeChecks = { location: Check; pay: Check; citizenship?: Check; clearance?: Check };

/**
 * The owner's citizenship and clearance, reduced to what the checks need.
 * Read from the master résumé in the app; never sent to a model.
 */
export type CandidateFacts = { usCitizen: boolean; clearanceLevel: number };

const CLEARANCE_LEVELS: { level: number; name: string; re: RegExp }[] = [
  { level: 5, name: "a polygraph", re: /\b(polygraph|full[- ]scope poly|ci poly)\b/i },
  { level: 4, name: "TS/SCI", re: /\b(ts\s*\/\s*sci|tssci)\b/i },
  { level: 3, name: "Top Secret", re: /\btop secret\b/i },
  { level: 2, name: "Secret", re: /\bsecret\b/i },
  { level: 1, name: "Public Trust", re: /\bpublic trust\b/i },
];
const levelOf = (text: string) => CLEARANCE_LEVELS.find((c) => c.re.test(text))?.level ?? 0;

export function candidateFacts(master: Resume): CandidateFacts {
  // Current clearances only: lines marked expired, inactive or former are history.
  const current = master.clearance.filter((l) => !/\b(expired|inactive|former|previous|lapsed)\b/i.test(l));
  return {
    usCitizen: /\bu\.?s\.?\s*citizen|united states citizen/i.test(master.contact.citizenship ?? ""),
    clearanceLevel: Math.max(0, ...current.map(levelOf)),
  };
}

/**
 * Citizenship and clearance gates, checked in code. The notes name only what
 * the posting asks for, never the owner's own level, since they go into the
 * evaluator's prompt.
 */
export function personalGates(text: string, c: CandidateFacts | null): Pick<CodeChecks, "citizenship" | "clearance"> {
  if (!c) return {};
  const out: Pick<CodeChecks, "citizenship" | "clearance"> = {};
  if (/\bu\.?s\.? citizen(ship)?\b[^.]{0,30}\brequired\b|\bmust be (a )?(u\.?s\.?|united states) citizen|\b(united states|u\.?s\.?) citizenship (is )?required\b/i.test(text)) {
    out.citizenship = c.usCitizen ? { status: "PASS", note: "US citizenship required: you meet it" } : { status: "FAIL", note: "US citizenship required" };
  }
  const needed = CLEARANCE_LEVELS.find((l) => l.re.test(text));
  if (needed) {
    const obtainable = /\b(able|ability|willing(ness)?|eligible) to obtain\b/i.test(text);
    out.clearance =
      c.clearanceLevel >= needed.level
        ? { status: "PASS", note: `Posting asks for ${needed.name}: you meet it` }
        : obtainable
          ? { status: "UNKNOWN", note: `Posting asks for the ability to obtain ${needed.name}` }
          : { status: "FAIL", note: `Posting asks for ${needed.name}: you don't currently hold it` };
  }
  return out;
}

/** Location, pay, and (with the owner's facts) citizenship and clearance, checked in code. */
export function codeChecks(p: FitPostingFacts, candidate: CandidateFacts | null = null): CodeChecks {
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

  return { location, pay, ...personalGates(p.descriptionText, candidate) };
}

/** The LOCATION_CHECK block of the request. */
export function codeChecksForPrompt(c: CodeChecks): string {
  return [
    `LOCATION_CHECK: ${c.location.status}. ${c.location.note}.`,
    `PAY_CHECK (from the posting's structured data, may miss a program budget note): ${c.pay.status}. ${c.pay.note}.`,
    c.citizenship ? `CITIZENSHIP_CHECK: ${c.citizenship.status}. ${c.citizenship.note}.` : "",
    c.clearance ? `CLEARANCE_CHECK: ${c.clearance.status}. ${c.clearance.note}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
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
  ctx: { posting: FitPostingFacts; bulletIds: Set<string>; model: string; now: Date; candidate?: CandidateFacts | null }
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

  const code = codeChecks(ctx.posting, ctx.candidate ?? null);
  const applying = out.verdict === "APPLY" || out.verdict === "APPLY_LOW_EFFORT";
  if (applying && code.pay.status === "FAIL") checks.push(`Check: ${code.pay.note}.`);
  if (applying && code.location.status === "FAIL") checks.push(`Check: ${code.location.note}.`);
  for (const g of [code.citizenship, code.clearance]) if (applying && g?.status === "FAIL") checks.push(`Check: ${g.note}.`);

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
    pace: paceFromBreakdown(breakdown),
    coverLetter: { needed: false, why: "Fake evaluation: the posting doesn't ask for one." },
  };
}

/** Score rules that signal an intense pace (scoring-config.ts red flags). */
const INTENSE_RULES = new Set(["pager-tempo", "fast-paced-startup", "founding", "series-a-c"]);

/** The pace the code score can see: intense when a tempo red flag fired, otherwise unknown. */
export function paceFromBreakdown(breakdown: BreakdownEntry[]): { rating: Pace; why: string } {
  const hit = breakdown.find((b) => INTENSE_RULES.has(b.rule));
  return hit ? { rating: "INTENSE", why: hit.label } : { rating: "UNKNOWN", why: "No tempo signals in the posting." };
}

/** The pace to show: Claude's rating when the job was evaluated, else what the score saw. */
export function paceOf(fit: FitAnalysis | null, breakdown: BreakdownEntry[]): { rating: Pace; why: string } {
  return fit?.pace ?? paceFromBreakdown(breakdown);
}
