import { z } from "zod";

import type { Resume } from "@/lib/jobs/resume-schema";
import { PAY, payK } from "@/lib/jobs/scoring-config";

/**
 * Application answers (pure, unit-tested). An application form's questions
 * are split in two, here, before anything reaches a model:
 *
 * - Personal questions (name, email, phone, links, location, citizenship,
 *   work authorization, sponsorship, clearance, pay expectations) are
 *   answered by the app from the master résumé and the pay config. They are
 *   never sent to Claude.
 * - Voluntary self-identification (gender, race, veteran, disability) is
 *   never answered for the owner.
 * - Everything else ("Why this role?", "Describe your FHIR experience") is
 *   drafted by Claude from the résumé content and the posting.
 */

/** "todo": a question collected from the page that Claude hasn't drafted yet. */
export type AnswerSource = "app" | "claude" | "you" | "todo";

export type ApplicationAnswer = {
  id: string;
  question: string;
  answer: string;
  source: AnswerSource;
  /** For the owner: what to check or fill in. */
  note: string;
  updatedAt: string;
};

export type QuestionKind =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "linkedin"
  | "website"
  | "location"
  | "citizenship"
  | "workAuthorization"
  | "sponsorship"
  | "clearance"
  | "salary"
  | "selfId"
  | "country"
  | "state"
  | "pickOnForm"
  | "yours"
  | "open";

const KINDS: { kind: Exclude<QuestionKind, "open">; re: RegExp }[] = [
  // Facts only the owner knows or should state themselves: never drafted.
  {
    kind: "yours",
    re: /\b(at least 18|years of age|date of birth|family members?|relatives?|close relationships?|non-disclosure|non-compete|worked (at|for) [A-Z]|employee of the u\.?s\.?|government employee|reserves|national guard|working on a project with|affirmation|i agree|i certify|consent)\b|^\s*(affirmation|signature)\b/i,
  },
  { kind: "pickOnForm", re: /^\s*(school|degree|discipline|major|education|gpa|how did you hear( about us)?)\b|\bhow did you hear\b/i },
  { kind: "country", re: /^\s*country( of residence)?\s*[:?*]*\s*$/i },
  { kind: "state", re: /^\s*state( or province)?\s*[:?*]*\s*$/i },
  { kind: "selfId", re: /\b(gender|sex|race|ethnicit|hispanic|latino|veteran|disabilit|pronoun|sexual orientation|self[- ]identif)/i },
  { kind: "sponsorship", re: /\b(sponsor|visa|h-?1b)/i },
  { kind: "workAuthorization", re: /\b(authori[sz]ed to work|work authori[sz]ation|eligible to work|legally (?:able|permitted) to work|right to work)/i },
  { kind: "citizenship", re: /\bcitizen(ship)?\b/i },
  { kind: "clearance", re: /\b(security )?clearance\b|\bpublic trust\b/i },
  { kind: "salary", re: /\b(salary|compensation|pay) (expectation|requirement|range|desired)|\bdesired (salary|pay|compensation)|\bexpected (salary|pay|compensation)/i },
  { kind: "email", re: /\be-?mail\b/i },
  { kind: "phone", re: /\b(phone|mobile|cell)( number)?\b/i },
  { kind: "linkedin", re: /\blinked ?in\b/i },
  { kind: "website", re: /\b(website|portfolio|github|personal (site|url))\b/i },
  // Only questions about where the owner lives: "willing to relocate to our DC location?" is a real question.
  {
    kind: "location",
    re: /^\s*(current |home )?(city|location|address)\b|\bwhere (do|are) you (live|located|based)\b|\b(home|mailing|street) address\b|\bzip( code)?\b|\bpostal code\b|\b(state|city) of residence\b/i,
  },
  { kind: "firstName", re: /\b(first|given) name\b/i },
  { kind: "lastName", re: /\b(last|family|sur) ?name\b/i },
  { kind: "fullName", re: /^\s*(full |legal )?name\s*[:?*]*\s*$|\byour (full |legal )?name\b/i },
];

export function classifyQuestion(question: string): QuestionKind {
  return KINDS.find((k) => k.re.test(question))?.kind ?? "open";
}

/** Questions are answered by the app, or left to the owner, without Claude. */
export const isLocalKind = (k: QuestionKind) => k !== "open";

/** One question per line; numbering, bullets, "(required)" and duplicates removed. */
export function parseQuestions(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "")
        .replace(/\s*\((?:required|optional)\)\s*/gi, " ")
        .replace(/\s*\*+\s*$/, "")
        .trim()
    )
    .filter((l) => l.length >= 2 && l.length <= 600)
    .filter((l) => {
      const k = l.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

const usCitizen = (master: Resume) => /\bu\.?s\.?\s*citizen/i.test(master.contact.citizenship ?? "");

/** The app's own answer to a personal question, from the master résumé and pay config. Never involves a model. */
export function localAnswer(master: Resume, question: string, kind: QuestionKind, ctx: { payFormEntry?: string }): { answer: string; note: string } {
  const c = master.contact;
  const link = (re: RegExp) => c.links.find((l) => re.test(l.label) || re.test(l.url))?.url ?? "";
  const missing = (what: string) => ({ answer: "", note: `Add your ${what} to the contact block of your master résumé, or type it here.` });
  switch (kind) {
    case "firstName":
      return { answer: c.firstName, note: "" };
    case "lastName":
      return { answer: c.lastName, note: "" };
    case "fullName":
      return { answer: `${c.firstName} ${c.lastName}`, note: "" };
    case "email":
      return { answer: c.email, note: "" };
    case "phone":
      return c.phone ? { answer: c.phone, note: "" } : missing("phone number");
    case "linkedin":
      return link(/linkedin/i) ? { answer: link(/linkedin/i), note: "" } : missing("LinkedIn link");
    case "website": {
      const site = c.links.find((l) => !/linkedin/i.test(l.label + l.url))?.url;
      return site ? { answer: site, note: "" } : missing("website link");
    }
    case "location":
      return c.location ? { answer: c.location, note: /address|zip|postal/i.test(question) ? "Add your street address or ZIP if the form needs it." : "" } : missing("location");
    case "citizenship":
      return c.citizenship ? { answer: c.citizenship, note: "" } : missing("citizenship");
    case "workAuthorization":
      return usCitizen(master) ? { answer: "Yes", note: "From your citizenship." } : { answer: "", note: "Answer this one yourself." };
    case "sponsorship":
      return usCitizen(master) ? { answer: "No", note: "From your citizenship." } : { answer: "", note: "Answer this one yourself." };
    case "clearance":
      return master.clearance.length
        ? { answer: master.clearance.join("; "), note: "Current state first, history second. Check it matches what the form asks." }
        : { answer: "", note: "No clearance lines in your master résumé." };
    case "salary":
      return {
        answer: ctx.payFormEntry?.trim() || `${payK(PAY.targetMinCents)} to ${payK(PAY.targetMaxCents)}`,
        note: ctx.payFormEntry ? "From the evaluation's pay advice." : "Your target range from settings. Pick the form's bucket that contains it.",
      };
    case "selfId":
      return { answer: "", note: "Voluntary self-identification. Not filled in for you; it has no effect on hiring." };
    case "country":
      return usCitizen(master) ? { answer: "United States", note: "" } : { answer: "", note: "Answer this one yourself." };
    case "state": {
      const st = c.location?.split(",")[1]?.trim();
      return st ? { answer: st, note: "" } : missing("location (City, ST)");
    }
    case "pickOnForm":
      return { answer: "", note: "Pick from the form's list." };
    case "yours":
      return { answer: "", note: "Answer this one yourself; it isn't something the app or Claude can know." };
    default:
      return { answer: "", note: "" };
  }
}

// --- Claude's side ---------------------------------------------------------------

export const draftedAnswersSchema = z.object({
  answers: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
      /** What the owner should confirm or add before sending; "" when nothing. */
      note: z.string(),
    })
  ),
});
export type DraftedAnswers = z.infer<typeof draftedAnswersSchema>;

export const jobChatOutputSchema = z.object({
  reply: z.string(),
  /** Application answers drafted in this turn, to offer for the answers list. Empty unless asked. */
  answers: draftedAnswersSchema.shape.answers,
});
export type JobChatOutput = z.infer<typeof jobChatOutputSchema>;

/** Merge new answers into the list: same question (case-insensitive) is replaced, unless the owner wrote it. */
export function mergeAnswers(list: ApplicationAnswer[], incoming: ApplicationAnswer[]): ApplicationAnswer[] {
  const out = [...list];
  for (const a of incoming) {
    const i = out.findIndex((x) => x.question.toLowerCase() === a.question.toLowerCase());
    if (i < 0) out.push(a);
    else if (out[i].source !== "you") out[i] = { ...a, id: out[i].id };
  }
  return out;
}
