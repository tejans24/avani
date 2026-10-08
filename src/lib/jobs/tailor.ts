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
  /** omitted: the whole role is left off this version (header and bullets). */
  experience: { id: string; omitted?: boolean; bullets: { id: string; text: string; status: BulletStatus }[] }[];
  skillGroupOrder: string[];
  coverNote: string;
  rationale: string;
  /** Show only this many skill lines (most relevant first); all when unset. Set when trimming to fit the page limit. */
  skillGroupsShown?: number;
  /** How the version started: Claude, the quick tailor, master as is, or copied from another job. */
  generatedBy: "claude" | "quick" | "master" | "reuse";
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
    if (role.omitted) continue; // not on the résumé, nothing to check
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
  for (const r of doc.experience) if (!r.omitted) for (const b of r.bullets) if (b.status !== "rejected") push(`bullet:${b.id}`, b.text, bullets.get(b.id)?.text ?? "");
  push("coverNote", doc.coverNote, "");
  return out;
}

export function hasBlocking(truth: TruthIssue[], style: { issues: StyleIssue[] }[]): boolean {
  return truth.some((i) => i.severity === "block") || style.some((s) => s.issues.some((i) => i.severity === "block"));
}

/**
 * The résumé to render: master's frame, the document's choices, rejected
 * bullets and omitted roles left out. A role with no kept bullets still shows
 * its header line.
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
    skills: doc.skillGroupsShown ? skills.slice(0, doc.skillGroupsShown) : skills,
    experience: master.experience
      .filter((e) => !byRole.get(e.id)?.omitted)
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
      const limit = i < 3 ? 4 : i < 6 ? 2 : 1;
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

// --- Leaving roles out ---------------------------------------------------------

const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const monthLabel = (i: number) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i % 12]} ${Math.floor(i / 12)}`;

/**
 * Gaps that leaving roles out would open in the work history: months an
 * omitted role covered that no kept role covers, after the earliest kept
 * role starts. Dropping the oldest roles just starts the résumé later, so it
 * isn't a gap. `now` closes "Present" periods.
 */
export function omittedRoleGaps(master: Resume, doc: TailoredDoc, now: Date): { roleId: string; gaps: string[] }[] {
  const omitted = new Set(doc.experience.filter((r) => r.omitted).map((r) => r.id));
  if (!omitted.size) return [];
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const covered = new Set<number>();
  let earliestKept = Infinity;
  for (const e of master.experience) {
    if (omitted.has(e.id)) continue;
    for (const p of e.periods) {
      const start = monthIndex(p.start);
      earliestKept = Math.min(earliestKept, start);
      for (let i = start; i <= (p.end ? monthIndex(p.end) : nowIdx); i++) covered.add(i);
    }
  }
  return master.experience
    .filter((e) => omitted.has(e.id))
    .map((e) => {
      const months = e.periods
        .flatMap((p) => {
          const out: number[] = [];
          for (let i = monthIndex(p.start); i <= (p.end ? monthIndex(p.end) : nowIdx); i++) out.push(i);
          return out;
        })
        .filter((i) => i > earliestKept && !covered.has(i))
        .sort((a, b) => a - b);
      const gaps: string[] = [];
      let runStart = -1;
      months.forEach((m, n) => {
        if (runStart < 0) runStart = m;
        if (months[n + 1] !== m + 1) {
          // Under three months reads as a normal move between jobs.
          if (m - runStart + 1 >= 3) gaps.push(`${monthLabel(runStart)} to ${monthLabel(m)}`);
          runStart = -1;
        }
      });
      return { roleId: e.id, gaps };
    })
    .filter((g) => g.gaps.length > 0);
}

// --- Other ways to start --------------------------------------------------------

/** Master as is: every non-reserve bullet, in master order, already accepted. */
export function masterDoc(master: Resume): TailoredDoc {
  return {
    headline: master.headline,
    summary: master.summary,
    experience: master.experience.map((e) => ({
      id: e.id,
      bullets: e.bullets.filter((b) => !b.reserve).map((b) => ({ id: b.id, text: b.text, status: "accepted" as const })),
    })),
    skillGroupOrder: master.skills.map((s) => s.group),
    coverNote: "",
    rationale: "Your master résumé as is.",
    generatedBy: "master",
  };
}

/**
 * A version made for another job, carried over to this one against the
 * current master: bullets no longer in master (or moved to another role) are
 * dropped, roles added to master since then come in with their default
 * bullets for review, and nothing new is invented. The checks run again in
 * the editor, against this posting.
 */
export function reuseDoc(master: Resume, from: TailoredDoc, label: string): TailoredDoc {
  const byRole = new Map(from.experience.map((r) => [r.id, r]));
  const headlines = [master.headline, ...master.headlineOptions];
  return {
    headline: headlines.includes(from.headline) ? from.headline : master.headline,
    summary: from.summary,
    experience: master.experience.map((e) => {
      const prev = byRole.get(e.id);
      const src = new Map(e.bullets.map((b) => [b.id, b]));
      if (!prev) {
        return { id: e.id, bullets: e.bullets.filter((b) => !b.reserve).map((b) => ({ id: b.id, text: b.text, status: "pending" as const })) };
      }
      return {
        id: e.id,
        ...(prev.omitted ? { omitted: true } : {}),
        bullets: prev.bullets.filter((b) => src.has(b.id)).map((b) => ({ ...b })),
      };
    }),
    skillGroupOrder: from.skillGroupOrder.filter((g) => master.skills.some((s) => s.group === g)),
    coverNote: "",
    rationale: `Copied from ${label}. The cover note was left out: it was written for that job.`,
    generatedBy: "reuse",
  };
}

const wordSet = (text: string) => new Set((text.toLowerCase().match(WORD) ?? []).filter((w) => !STOP.has(w)));

/** How alike two postings read (0 to 1): shared words over all words. Used to rank versions to reuse. */
export function postingSimilarity(a: string, b: string): number {
  const x = wordSet(a);
  const y = wordSet(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

// --- Edits proposed in the chat -------------------------------------------------

export const TAILOR_EDIT_OPS = [
  "SET_HEADLINE",
  "SET_SUMMARY",
  "REWORD_BULLET",
  "ADD_BULLET",
  "REMOVE_BULLET",
  "MOVE_BULLET",
  "OMIT_ROLE",
  "INCLUDE_ROLE",
  "SET_SKILL_ORDER",
  "SET_COVER_NOTE",
] as const;

/**
 * One change Claude proposes in the chat. Flat on purpose (structured output):
 * fields an op doesn't use are "" / -1 / [].
 */
export const tailorEditSchema = z.object({
  op: z.enum(TAILOR_EDIT_OPS),
  roleId: z.string(),
  bulletId: z.string(),
  /** New text for SET_HEADLINE, SET_SUMMARY, REWORD_BULLET, SET_COVER_NOTE. */
  text: z.string(),
  /** 0-based position for ADD_BULLET and MOVE_BULLET; -1 for the end. */
  position: z.number().int(),
  /** SET_SKILL_ORDER: group names, most relevant first. */
  skillGroups: z.array(z.string()),
  /** One short line for the owner. */
  why: z.string(),
});
export type TailorEdit = z.infer<typeof tailorEditSchema>;

export const tailorChatOutputSchema = z.object({
  /** The answer to the owner, plain and short. */
  reply: z.string(),
  /** Changes to apply, in order. Empty when the owner only asked a question. */
  edits: z.array(tailorEditSchema),
});
export type TailorChatOutput = z.infer<typeof tailorChatOutputSchema>;

/**
 * Apply proposed edits to a copy of the document. Each edit is checked
 * against master first: bullets must belong to the role in master, headlines
 * must be approved ones, skill groups must exist. Edits that fail are skipped
 * with a reason; the truth and style checks still run on the result in the
 * editor. Reworded bullets become "edited", added ones "accepted".
 */
export function applyTailorEdits(master: Resume, doc: TailoredDoc, edits: TailorEdit[]): { doc: TailoredDoc; applied: string[]; skipped: string[] } {
  const next: TailoredDoc = structuredClone(doc);
  const applied: string[] = [];
  const skipped: string[] = [];
  const roleOf = (roleId: string) => {
    const m = master.experience.find((e) => e.id === roleId);
    if (!m) return null;
    let r = next.experience.find((x) => x.id === roleId);
    if (!r) {
      r = { id: roleId, bullets: [] };
      next.experience.push(r);
    }
    return { m, r };
  };
  const label = (e: TailorEdit) => e.why || e.op.toLowerCase().replace(/_/g, " ");

  for (const e of edits) {
    const fail = (why: string) => skipped.push(`${label(e)}: ${why}`);
    switch (e.op) {
      case "SET_HEADLINE":
        if (![master.headline, ...master.headlineOptions].includes(e.text.trim())) {
          fail("that headline isn't one of your approved headlines");
          continue;
        }
        next.headline = e.text.trim();
        break;
      case "SET_SUMMARY":
        if (!e.text.trim()) {
          fail("empty summary");
          continue;
        }
        next.summary = e.text.trim();
        break;
      case "SET_COVER_NOTE":
        next.coverNote = e.text.trim();
        break;
      case "SET_SKILL_ORDER": {
        const groups = e.skillGroups.filter((g) => master.skills.some((s) => s.group === g));
        if (!groups.length) {
          fail("none of those skill groups exist");
          continue;
        }
        next.skillGroupOrder = [...groups, ...master.skills.map((s) => s.group).filter((g) => !groups.includes(g))];
        break;
      }
      case "OMIT_ROLE":
      case "INCLUDE_ROLE": {
        const x = roleOf(e.roleId);
        if (!x) {
          fail("no such role");
          continue;
        }
        x.r.omitted = e.op === "OMIT_ROLE";
        break;
      }
      default: {
        const x = roleOf(e.roleId);
        const src = x?.m.bullets.find((b) => b.id === e.bulletId);
        if (!x || !src) {
          fail("that bullet isn't in your master résumé under that role");
          continue;
        }
        const list = x.r.bullets;
        const idx = list.findIndex((b) => b.id === e.bulletId);
        const at = (n: number) => (n < 0 || n > list.length ? list.length : n);
        if (e.op === "ADD_BULLET") {
          if (idx >= 0 && list[idx].status !== "rejected") {
            fail("already on the résumé");
            continue;
          }
          if (idx >= 0) list.splice(idx, 1);
          list.splice(at(e.position), 0, { id: src.id, text: src.text, status: "accepted" });
        } else if (idx < 0) {
          fail("that bullet isn't on this version");
          continue;
        } else if (e.op === "REMOVE_BULLET") {
          list[idx].status = "rejected";
        } else if (e.op === "MOVE_BULLET") {
          const [b] = list.splice(idx, 1);
          list.splice(at(e.position), 0, b);
        } else if (e.op === "REWORD_BULLET") {
          if (!e.text.trim()) {
            fail("empty text");
            continue;
          }
          list[idx].text = e.text.trim();
          list[idx].status = e.text.trim() === src.text ? "accepted" : "edited";
        }
      }
    }
    applied.push(label(e));
  }
  return { doc: next, applied, skipped };
}

/** The working version as the chat sees it: ids and text only. */
export function docForChat(master: Resume, doc: TailoredDoc) {
  const byRole = new Map(doc.experience.map((r) => [r.id, r]));
  return {
    headline: doc.headline,
    summary: doc.summary,
    skillGroupOrder: doc.skillGroupOrder,
    roles: master.experience.map((e) => {
      const r = byRole.get(e.id);
      return {
        roleId: e.id,
        omitted: Boolean(r?.omitted),
        bullets: (r?.bullets ?? []).filter((b) => b.status !== "rejected").map((b) => ({ id: b.id, text: b.text })),
      };
    }),
    coverNote: doc.coverNote,
  };
}

// --- Fitting the page limit -------------------------------------------------------

export type TrimOp = { kind: "bullet"; roleId: string; bulletId: string } | { kind: "skills"; shown: number };

const MIN_SKILL_LINES = 8;

/**
 * What to cut, in order, when a version runs over the page limit: older
 * roles' extra bullets (keeping one each), then recent roles' bullets beyond
 * three, then the least relevant skill lines (down to eight), then older
 * roles to their header line. Roles are in master order, newest first; the
 * first three count as recent. Bullets go from the end of each role's list,
 * where the least relevant sit.
 */
export function trimPlan(master: Resume, doc: TailoredDoc): TrimOp[] {
  const byRole = new Map(doc.experience.map((r) => [r.id, r]));
  const kept = (roleId: string) => (byRole.get(roleId)?.omitted ? [] : (byRole.get(roleId)?.bullets ?? []).filter((b) => b.status !== "rejected"));
  const roles = master.experience.map((e) => e.id);
  const ops: TrimOp[] = [];
  const cut = (roleId: string, keep: number) =>
    kept(roleId)
      .slice(keep)
      .reverse()
      .forEach((b) => ops.push({ kind: "bullet", roleId, bulletId: b.id }));

  for (let i = roles.length - 1; i >= 3; i--) cut(roles[i], 1);
  for (let i = Math.min(2, roles.length - 1); i >= 0; i--) cut(roles[i], 3);
  for (let n = (doc.skillGroupsShown ?? master.skills.length) - 2; n >= MIN_SKILL_LINES; n -= 2) ops.push({ kind: "skills", shown: n });
  for (let i = roles.length - 1; i >= 3; i--) cut(roles[i], 0);
  return ops;
}

/** The document with the first ops applied: cut bullets become "rejected" (restorable in the editor). */
export function applyTrims(doc: TailoredDoc, ops: TrimOp[]): TailoredDoc {
  const next: TailoredDoc = structuredClone(doc);
  for (const op of ops) {
    if (op.kind === "skills") next.skillGroupsShown = Math.min(next.skillGroupsShown ?? Infinity, op.shown);
    else {
      const b = next.experience.find((r) => r.id === op.roleId)?.bullets.find((x) => x.id === op.bulletId);
      if (b) b.status = "rejected";
    }
  }
  return next;
}
