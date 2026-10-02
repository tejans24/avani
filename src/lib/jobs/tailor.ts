import { z } from "zod";

import type { Resume } from "@/lib/jobs/resume-schema";
import { checkStyle, type StyleIssue } from "@/lib/jobs/resume-style";
import { STACK_RULES } from "@/lib/jobs/scoring-config";

/**
 * Tailoring core (pure, unit-tested): the model's output schema, the
 * tailored document stored on TailoredResume.data, the truthfulness check,
 * and a no-AI "quick tailor" that only selects and reorders master bullets.
 *
 * The truthfulness rule: a tailored résumé may select, reorder and lightly
 * reword the owner's master content. It may not add facts. Enforced here, in
 * code, after every generation and every edit:
 *   - bullets must exist in master under the same role (ids, never text match)
 *   - a reworded bullet may not contain a number its master bullet doesn't
 *   - summary / cover-note numbers must appear somewhere in master
 *   - names, tools and acronyms that appear nowhere in master are flagged
 *   - the headline must be master's or one of master.headlineOptions
 */

// --- Model output -------------------------------------------------------------

export const tailorOutputSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  experience: z.array(
    z.object({
      roleId: z.string(),
      bullets: z.array(
        z.object({
          id: z.string(),
          /** Reworded text, or exactly the master text when unchanged. */
          text: z.string(),
        })
      ),
    })
  ),
  /** Skill group names, most relevant first. */
  skillGroupOrder: z.array(z.string()),
  coverNote: z.string(),
  /** One or two sentences on what was emphasized and why (shown to the owner). */
  rationale: z.string(),
});
export type TailorOutput = z.infer<typeof tailorOutputSchema>;

// --- Stored document ----------------------------------------------------------

export type BulletStatus = "pending" | "accepted" | "edited" | "rejected";

export type TailoredDoc = {
  headline: string;
  summary: string;
  experience: { id: string; bullets: { id: string; text: string; status: BulletStatus }[] }[];
  skillGroupOrder: string[];
  coverNote: string;
  rationale: string;
  generatedBy: "claude" | "quick";
};

function masterBullets(master: Resume): Map<string, { roleId: string; text: string }> {
  const m = new Map<string, { roleId: string; text: string }>();
  for (const e of master.experience) for (const b of e.bullets) m.set(b.id, { roleId: e.id, text: b.text });
  for (const p of master.projects) for (const b of p.bullets) m.set(b.id, { roleId: p.id, text: b.text });
  return m;
}

/**
 * Turn model output into a stored document, dropping anything that doesn't
 * trace to master (unknown roles/bullets, duplicates, foreign headline).
 * Every kept bullet starts "pending" for the owner's review.
 */
export function docFromOutput(master: Resume, out: TailorOutput, generatedBy: TailoredDoc["generatedBy"]): TailoredDoc {
  const bullets = masterBullets(master);
  const allowedHeadlines = [master.headline, ...master.headlineOptions];
  const seen = new Set<string>();
  const byRole = new Map(out.experience.map((r) => [r.roleId, r]));
  return {
    headline: allowedHeadlines.includes(out.headline.trim()) ? out.headline.trim() : master.headline,
    summary: out.summary.trim(),
    experience: master.experience.map((e) => ({
      id: e.id,
      bullets: (byRole.get(e.id)?.bullets ?? [])
        .filter((b) => {
          const src = bullets.get(b.id);
          if (!src || src.roleId !== e.id || seen.has(b.id)) return false;
          seen.add(b.id);
          return true;
        })
        .map((b) => ({ id: b.id, text: b.text.trim() || bullets.get(b.id)!.text, status: "pending" as const })),
    })),
    skillGroupOrder: out.skillGroupOrder.filter((g) => master.skills.some((s) => s.group === g)),
    coverNote: out.coverNote.trim(),
    rationale: out.rationale.trim(),
    generatedBy,
  };
}

// --- Truthfulness --------------------------------------------------------------

export type TruthIssue = { severity: "block" | "warn"; where: string; message: string };

const NUMBER_RE = /\$?\d[\d,]*(?:\.\d+)?\s?(?:%|\+|[kKmMbB]\b|x\b)?/g;
const normNum = (s: string) => s.replace(/[,\s]/g, "").toLowerCase();
/** Proper nouns, tools, acronyms: a capital after the first letter, a digit, or a capitalized word mid-sentence. */
const TERM_RE = /(?<![.!?:]\s|^)\b[A-Z][A-Za-z0-9+#./-]*|\b[A-Za-z]*[A-Z][A-Za-z]*[A-Z0-9][A-Za-z0-9+#./-]*/g;

function masterCorpus(master: Resume): string {
  return [
    master.headline,
    ...master.headlineOptions,
    master.summary,
    ...master.skills.map((s) => `${s.group} ${s.text}`),
    ...master.experience.flatMap((e) => [e.organization, e.title, e.location ?? "", e.intro ?? "", ...e.bullets.map((b) => b.text)]),
    ...master.projects.flatMap((p) => [p.name, ...p.bullets.map((b) => b.text)]),
    ...master.clearance,
    ...master.education.map((e) => e.text),
    ...master.additional,
    ...master.stories.flatMap((s) => [s.title, s.text]),
  ].join("\n");
}

function newNumbers(text: string, source: string): string[] {
  const have = new Set((source.match(NUMBER_RE) ?? []).map(normNum));
  return [...new Set((text.match(NUMBER_RE) ?? []).map((n) => n.trim()))].filter((n) => !have.has(normNum(n)));
}

function newTerms(text: string, corpusLower: string): string[] {
  const terms = (text.match(TERM_RE) ?? []).map((t) => t.replace(/[.,;:)]+$/, "")).filter((t) => t.length >= 2);
  return [...new Set(terms)].filter((t) => !corpusLower.includes(t.toLowerCase()));
}

export function checkTruth(master: Resume, doc: TailoredDoc): TruthIssue[] {
  const issues: TruthIssue[] = [];
  const bullets = masterBullets(master);
  const corpus = masterCorpus(master);
  const corpusLower = corpus.toLowerCase();

  if (![master.headline, ...master.headlineOptions].includes(doc.headline)) {
    issues.push({ severity: "block", where: "headline", message: "Headline isn't your master headline or one of your approved alternates." });
  }

  for (const role of doc.experience) {
    for (const b of role.bullets) {
      if (b.status === "rejected") continue;
      const src = bullets.get(b.id);
      if (!src || src.roleId !== role.id) {
        issues.push({ severity: "block", where: `bullet:${b.id}`, message: "This bullet isn't in your master résumé under this role." });
        continue;
      }
      const nums = newNumbers(b.text, src.text);
      if (nums.length) issues.push({ severity: "block", where: `bullet:${b.id}`, message: `Adds ${nums.join(", ")}, which the original bullet doesn't say.` });
      const terms = newTerms(b.text, corpusLower);
      if (terms.length) issues.push({ severity: "warn", where: `bullet:${b.id}`, message: `Mentions ${terms.join(", ")}, which isn't anywhere in your master résumé.` });
    }
  }

  for (const [where, text] of [["summary", doc.summary], ["coverNote", doc.coverNote]] as const) {
    const nums = newNumbers(text, corpus);
    if (nums.length) issues.push({ severity: "block", where, message: `Uses ${nums.join(", ")}, which isn't in your master résumé.` });
    const terms = newTerms(text, corpusLower);
    if (terms.length) issues.push({ severity: "warn", where, message: `Mentions ${terms.join(", ")}, which isn't anywhere in your master résumé.` });
  }
  return issues;
}

/** Style guard over every tailored text, with master wording as the baseline. */
export function checkDocStyle(master: Resume, doc: TailoredDoc): { where: string; issues: StyleIssue[] }[] {
  const bullets = masterBullets(master);
  const out: { where: string; issues: StyleIssue[] }[] = [];
  const push = (where: string, text: string, baseline: string) => {
    const issues = checkStyle(text, baseline);
    if (issues.length) out.push({ where, issues });
  };
  push("headline", doc.headline, master.headline);
  push("summary", doc.summary, master.summary);
  for (const r of doc.experience) for (const b of r.bullets) if (b.status !== "rejected") push(`bullet:${b.id}`, b.text, bullets.get(b.id)?.text ?? "");
  push("coverNote", doc.coverNote, "");
  return out;
}

export function hasBlocking(truth: TruthIssue[], style: { issues: StyleIssue[] }[]): boolean {
  return truth.some((i) => i.severity === "block") || style.some((s) => s.issues.some((i) => i.severity === "block"));
}

/**
 * The résumé to render: master's frame, the document's choices, rejected
 * bullets left out. A role with no kept bullets still shows its header line.
 */
export function renderResume(master: Resume, doc: TailoredDoc): Resume {
  const byRole = new Map(doc.experience.map((r) => [r.id, r]));
  const order = doc.skillGroupOrder.length ? doc.skillGroupOrder : master.skills.map((s) => s.group);
  const skills = [
    ...order.map((g) => master.skills.find((s) => s.group === g)).filter((s): s is Resume["skills"][number] => Boolean(s)),
    ...master.skills.filter((s) => !order.includes(s.group)),
  ];
  return {
    ...master,
    headline: doc.headline,
    summary: doc.summary,
    skills,
    experience: master.experience
      .map((e) => {
        const kept = (byRole.get(e.id)?.bullets ?? []).filter((b) => b.status !== "rejected");
        const src = new Map(e.bullets.map((b) => [b.id, b]));
        return { ...e, bullets: kept.map((b) => ({ ...src.get(b.id)!, text: b.text })) };
      }),
  };
}

// --- Quick tailor (no AI): select + reorder only -------------------------------

const WORD = /[a-z][a-z0-9+#.]{2,}/g;
const STOP = new Set(
  "the and for with that this from will you your our are have has was were into across using use used work team teams build built about their they them what when where which while within without other more most also such than then there these those able including".split(
    " "
  )
);

export function quickTailor(master: Resume, posting: { title: string; descriptionText: string }): TailoredDoc {
  const text = `${posting.title}\n${posting.descriptionText}`;
  const postingWords = new Set((text.toLowerCase().match(WORD) ?? []).filter((w) => !STOP.has(w)));
  const stackHits = new Set(STACK_RULES.filter((r) => r.pattern.test(text)).map((r) => r.id));
  const score = (b: { text: string; skills: string[] }) =>
    b.skills.filter((s) => stackHits.has(s)).length * 3 +
    [...new Set(b.text.toLowerCase().match(WORD) ?? [])].filter((w) => postingWords.has(w)).length;

  const out: TailorOutput = {
    headline: master.headline,
    summary: master.summary,
    experience: master.experience.map((e, i) => {
      const limit = i < 3 ? 5 : i < 6 ? 3 : 1;
      const ranked = [...e.bullets]
        .map((b, idx) => ({ b, idx, s: score(b) - (b.reserve ? 2 : 0) }))
        .filter((x) => !x.b.reserve || x.s > 2)
        .sort((a, b) => b.s - a.s || a.idx - b.idx)
        .slice(0, limit)
        // Keep the master's own order within the chosen set: it reads better.
        .sort((a, b) => a.idx - b.idx);
      return { roleId: e.id, bullets: ranked.map((x) => ({ id: x.b.id, text: x.b.text })) };
    }),
    skillGroupOrder: [...master.skills]
      .map((s, i) => ({ g: s.group, i, s: [...new Set(s.text.toLowerCase().match(WORD) ?? [])].filter((w) => postingWords.has(w)).length }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.g),
    coverNote: "",
    rationale: "Quick tailor: picked and reordered your bullets by overlap with the posting. Wording is unchanged.",
  };
  return docFromOutput(master, out, "quick");
}
