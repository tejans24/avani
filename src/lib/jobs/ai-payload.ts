import type { Resume } from "@/lib/jobs/resume-schema";

/**
 * The privacy boundary for every AI call (tailoring, cover notes).
 *
 * Rule: the owner's personal details never leave the app. Only the résumé
 * content tailoring needs is sent; contact details are re-attached locally
 * when the PDF is rendered.
 *
 * Three layers:
 * 1. buildTailoringPayload: allowlist. Copies only content fields; the
 *    contact block and per-role locations are never copied.
 * 2. scrubPersonal: replaces any contact value that appears inside free text
 *    (a bullet, story, or note) with a placeholder, plus anything shaped
 *    like an email or US phone number.
 * 3. assertNoPersonalData: final check on the serialized request. If any
 *    contact value is still present, the call is refused (throws), never sent.
 *
 * Pure functions (unit-tested). The AI client must only ever be called with
 * the output of serializeForAi.
 */

export type Contact = Resume["contact"];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every personal value worth guarding, normalized. Short values are skipped
 * to avoid matching ordinary words (a 2-letter name, "MD"). */
function personalValues(contact: Contact): string[] {
  const urls = contact.links.flatMap((l) => {
    const bare = l.url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
    return [l.url, bare];
  });
  const phoneDigits = contact.phone?.replace(/\D/g, "");
  return [
    contact.firstName,
    contact.lastName,
    `${contact.firstName} ${contact.lastName}`,
    contact.email,
    contact.phone,
    phoneDigits && phoneDigits.length >= 7 ? phoneDigits.slice(-7) : undefined,
    contact.location,
    // The city on its own too ("Baltimore" as well as "Baltimore, MD"). Postings that name it get it
    // redacted; the commute is checked in code, so nothing needs it.
    contact.location?.split(",")[0],
    ...urls,
  ]
    .filter((v): v is string => Boolean(v && v.trim().length >= 3))
    .sort((a, b) => b.length - a.length); // longest first: full name before parts
}

/** Replace personal values and email/phone shapes in free text. */
export function scrubPersonal(text: string, contact: Contact): string {
  let out = text.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]");
  for (const v of personalValues(contact)) {
    out = out.replace(new RegExp(`(?<![\\w])${escapeRe(v)}(?![\\w])`, "gi"), "[redacted]");
  }
  return out;
}

type PayloadBullet = { id: string; text: string; skills: string[]; reserve: boolean };

export type TailoringPayload = {
  headline: string;
  headlineOptions: string[];
  summary: string;
  skills: { group: string; text: string }[];
  experience: {
    id: string;
    organization: string;
    title: string;
    periods: { start: string; end: string | null }[];
    intro?: string;
    bullets: PayloadBullet[];
  }[];
  projects: { id: string; name: string; bullets: PayloadBullet[] }[];
  /** Sent so gov-lane summaries can mention eligibility; rendered verbatim. */
  clearance: string[];
  stories: { id: string; title: string; text: string; skills: string[] }[];
  posting: { title: string; company: string; lane: string; description: string };
  tailoringNotes?: string;
};

/**
 * Allowlist copy: only content fields, every free-text field scrubbed.
 * Education and Additional lines are rendered verbatim from master and are
 * not sent. The posting is scrubbed too: a posting that happens to mention
 * the owner's city must not trip the final check.
 */
export function buildTailoringPayload(input: {
  master: Resume;
  posting: { title: string; company: string; lane: string; description: string };
  tailoringNotes?: string | null;
}): TailoringPayload {
  const { master } = input;
  const s = (t: string) => scrubPersonal(t, master.contact);
  const bullets = (bs: Resume["experience"][number]["bullets"]): PayloadBullet[] =>
    bs.map((b) => ({ id: b.id, text: s(b.text), skills: b.skills, reserve: b.reserve }));

  return {
    headline: s(master.headline),
    headlineOptions: master.headlineOptions.map(s),
    summary: s(master.summary),
    skills: master.skills.map((g) => ({ group: g.group, text: s(g.text) })),
    experience: master.experience.map((e) => ({
      id: e.id,
      organization: s(e.organization),
      title: s(e.title),
      periods: e.periods.map((p) => ({ start: p.start, end: p.end ?? null })),
      intro: e.intro ? s(e.intro) : undefined,
      bullets: bullets(e.bullets),
    })),
    projects: master.projects.map((p) => ({ id: p.id, name: s(p.name), bullets: bullets(p.bullets) })),
    clearance: master.clearance.map(s),
    stories: master.stories.map((st) => ({ id: st.id, title: s(st.title), text: s(st.text), skills: st.skills })),
    posting: {
      title: s(input.posting.title),
      company: s(input.posting.company),
      lane: input.posting.lane,
      description: s(input.posting.description),
    },
    tailoringNotes: input.tailoringNotes ? s(input.tailoringNotes) : undefined,
  };
}

export class PersonalDataLeakError extends Error {}

/** Throws if any personal value appears anywhere in the outgoing request. */
export function assertNoPersonalData(serialized: string, contact: Contact): void {
  const haystack = serialized.toLowerCase();
  const leaked = personalValues(contact).filter((v) => {
    const re = new RegExp(`(?<![\\w])${escapeRe(v.toLowerCase())}(?![\\w])`);
    return re.test(haystack);
  });
  if (leaked.length) {
    // Do not include the values themselves in the error (it may be logged).
    throw new PersonalDataLeakError(`Refused AI call: request contained ${leaked.length} personal value(s).`);
  }
}

/** The only way to produce an AI request body. */
export function serializeForAi(payload: TailoringPayload, contact: Contact): string {
  const body = JSON.stringify(payload);
  assertNoPersonalData(body, contact);
  return body;
}

/**
 * The request split for prompt caching: the résumé part is identical for
 * every posting (cacheable prefix), the posting part varies. Each part goes
 * through the same check as serializeForAi.
 */
export function serializeForAiParts(payload: TailoringPayload, contact: Contact): { resume: string; posting: string } {
  const { posting, tailoringNotes, ...resume } = payload;
  const parts = {
    resume: JSON.stringify(resume),
    posting: JSON.stringify({ posting, tailoringNotes: tailoringNotes ?? null }),
  };
  assertNoPersonalData(parts.resume, contact);
  assertNoPersonalData(parts.posting, contact);
  return parts;
}
