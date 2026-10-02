/**
 * Résumé style guard: tailored résumés and cover notes must read as written
 * by the owner, not by a model. Enforced in code, not just in the prompt:
 * every tailored bullet, summary and cover note runs through checkStyle
 * before it can be saved, previewed or exported.
 *
 * - "block" issues (em dashes) prevent save/export until fixed.
 * - "warn" issues (AI-tell vocabulary and constructions) are highlighted in
 *   the editor. A phrase that already appears in the owner's own master
 *   wording is not flagged: the rule is "don't introduce it", not "rewrite me".
 *
 * Pure functions (unit-tested). The tailoring prompt is built from the same
 * lists so the model is told exactly what the guard will reject.
 */

export type StyleIssue = {
  severity: "block" | "warn";
  rule: string;
  message: string;
  /** The offending text as it appears. */
  match: string;
  index: number;
};

/** Never allowed in résumé or cover-note text. */
export const BLOCKED_CHARACTERS: { rule: string; pattern: RegExp; message: string }[] = [
  { rule: "em-dash", pattern: /—|--/g, message: "No em dashes. Use a comma, period, colon, or parentheses." },
];

/** Words and phrases that read as AI-written. Flagged unless already in master. */
export const AI_TELL_PHRASES: string[] = [
  "spearheaded", "spearheading", "leveraged", "leveraging", "utilized", "utilizing",
  "delve", "delved", "seamless", "seamlessly", "robust", "cutting-edge",
  "state-of-the-art", "passionate", "results-driven", "detail-oriented",
  "proven track record", "dynamic", "synergy", "synergies", "fostering", "fostered",
  "pivotal", "testament", "tapestry", "landscape", "ever-evolving", "in today's",
  "elevate", "elevated", "empower", "empowered", "empowering", "orchestrated",
  "championed", "holistic", "innovative", "best-in-class", "world-class",
  "game-changer", "game-changing", "meticulous", "meticulously", "showcasing",
  "underscore", "underscores", "realm", "furthermore", "moreover", "additionally",
  "navigate the complexities", "navigating the complexities", "at the intersection of",
  "a wide range of", "deep dive", "unlock", "unlocking", "harness", "harnessing",
  "transformative", "visionary", "thought leader",
];

/** Sentence shapes that read as AI-written. */
export const AI_TELL_CONSTRUCTIONS: { rule: string; pattern: RegExp; message: string }[] = [
  {
    rule: "not-only-but-also",
    pattern: /\bnot only\b[^.]{0,80}\bbut also\b/gi,
    message: "\"Not only … but also\" reads as generated. Say the two things plainly.",
  },
  {
    rule: "participle-tail",
    pattern: /,\s(ensuring|enabling|driving|resulting in|allowing|fostering|highlighting|underscoring|showcasing)\b[^\n]*$/gim,
    message: "Trailing \", ensuring/enabling …\" clause. End on the result instead.",
  },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PHRASE_RES = AI_TELL_PHRASES.map((p) => ({
  phrase: p,
  re: new RegExp(`(?<![\\w-])${escapeRe(p)}(?![\\w-])`, "gi"),
}));

/**
 * @param text      tailored text to check
 * @param baseline  the owner's own wording it was derived from (master);
 *                  phrases already present there are not flagged
 */
export function checkStyle(text: string, baseline = ""): StyleIssue[] {
  const issues: StyleIssue[] = [];
  const base = baseline.toLowerCase();

  for (const c of BLOCKED_CHARACTERS) {
    for (const m of text.matchAll(c.pattern)) {
      issues.push({ severity: "block", rule: c.rule, message: c.message, match: m[0], index: m.index ?? 0 });
    }
  }
  for (const { phrase, re } of PHRASE_RES) {
    if (base.includes(phrase)) continue;
    for (const m of text.matchAll(re)) {
      issues.push({
        severity: "warn",
        rule: "ai-tell-phrase",
        message: `"${m[0]}" reads as AI-written. Use the plain word you'd actually say.`,
        match: m[0],
        index: m.index ?? 0,
      });
    }
  }
  for (const c of AI_TELL_CONSTRUCTIONS) {
    for (const m of text.matchAll(c.pattern)) {
      if (base.includes(m[0].toLowerCase())) continue;
      issues.push({ severity: "warn", rule: c.rule, message: c.message, match: m[0], index: m.index ?? 0 });
    }
  }
  return issues.sort((a, b) => a.index - b.index);
}

export const hasBlockingIssues = (issues: StyleIssue[]) => issues.some((i) => i.severity === "block");

/** Rules appended to every tailoring / cover-note prompt. */
export function styleRulesForPrompt(): string {
  return [
    "Write like the candidate wrote it themselves: plain, specific, concrete.",
    "Never use em dashes (—) or double hyphens. Use commas, periods, colons, or parentheses.",
    "Do not introduce any of these words or phrases unless they already appear in the master résumé: " +
      AI_TELL_PHRASES.join(", ") + ".",
    "Do not use \"not only … but also\". Do not end a bullet with a trailing \", ensuring …\" or \", enabling …\" clause.",
    "Prefer the candidate's original wording. Change only what the posting gives a reason to change.",
  ].join("\n");
}
