import { z } from "zod";

/**
 * The master résumé format (resume/master.json → ResumeMaster.data) and the
 * tailored variants (TailoredResume.data) share this shape. It mirrors the
 * owner's existing résumé layout: header (name, headline, contact line),
 * Summary, Core Skills, Experience, Clearance, Education, Additional.
 *
 * Every bullet carries a stable `id` so a tailored variant can be traced back
 * line by line to master: the diff view and the truthfulness check both work
 * from ids, never from fuzzy text matching. `skills` tags drive relevance
 * ranking when bullets are selected and reordered for a posting.
 *
 * The default (untailored) résumé shows every bullet without `reserve: true`.
 *
 * `month` is "YYYY-MM"; `end: null` means "Present".
 */

const MONTH_RE = /^\d{4}-\d{2}$/;
const month = z.string().regex(MONTH_RE, "Use YYYY-MM");
const id = z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/, "Lowercase, digits, hyphens");

export const bulletSchema = z.object({
  id,
  text: z.string().trim().min(1).max(800),
  /** Skill tags, e.g. ["aws-serverless", "event-driven", "python"]. */
  skills: z.array(z.string().trim().min(1)).default([]),
  /**
   * Reserve bullet: true and owned, but left off the default résumé.
   * Tailoring may bring it in when a posting asks for its skills.
   */
  reserve: z.boolean().default(false),
});

export const periodSchema = z.object({ start: month, end: month.nullable() });

export const experienceSchema = z.object({
  id,
  organization: z.string().trim().min(1),
  title: z.string().trim().min(1),
  /** Shown in the role header ("Remote", "Washington, DC"). Never sent to AI. */
  location: z.string().trim().optional(),
  /** One or more date ranges (a role can be held twice, e.g. a firm paused). */
  periods: z.array(periodSchema).min(1),
  /** Optional one-line description under the role header. */
  intro: z.string().trim().max(400).optional(),
  bullets: z.array(bulletSchema).min(1),
});

export const projectSchema = z.object({
  id,
  name: z.string().trim().min(1),
  url: z.string().trim().optional(),
  bullets: z.array(bulletSchema).min(1),
});

export const resumeSchema = z.object({
  /** Never sent to AI (see ai-payload.ts); re-attached when the PDF renders. */
  contact: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.email(),
    phone: z.string().trim().optional(),
    location: z.string().trim().optional(),
    /** e.g. "U.S. Citizen", shown at the end of the contact line. */
    citizenship: z.string().trim().optional(),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  }),
  /** The title line under the name, e.g. "Principal Engineer and Architect". */
  headline: z.string().trim().min(1).max(120),
  /**
   * Other headlines that are equally true, which tailoring may choose instead
   * (e.g. "Principal Software Engineer" for IC roles). Tailoring never writes
   * a headline that isn't the default or in this list.
   */
  headlineOptions: z.array(z.string().trim().min(1).max(120)).default([]),
  summary: z.string().trim().min(1).max(1200),
  /** "Group: text" lines, kept verbatim (items can contain commas). */
  skills: z.array(z.object({ group: z.string().trim().min(1), text: z.string().trim().min(1) })),
  experience: z.array(experienceSchema).min(1),
  projects: z.array(projectSchema).default([]),
  /** Clearance section bullets. */
  clearance: z.array(z.string().trim().min(1)).default([]),
  /** Education lines, verbatim. */
  education: z.array(z.object({ id, text: z.string().trim().min(1) })).default([]),
  /** Trailing lines (board seats, volunteering), verbatim. */
  additional: z.array(z.string().trim().min(1)).default([]),
  /**
   * Short first-person accounts (situation, what you did, result with
   * numbers). Source material for cover notes and interview prep; never
   * pasted into the résumé itself. Count as master for truthfulness.
   */
  stories: z
    .array(
      z.object({
        id,
        title: z.string().trim().min(1).max(120),
        text: z.string().trim().min(1).max(2000),
        skills: z.array(z.string().trim().min(1)).default([]),
        /** Optional link to the experience entry it happened in. */
        experienceId: z.string().optional(),
      })
    )
    .default([]),
});

export type Resume = z.infer<typeof resumeSchema>;
export type ResumeBullet = z.infer<typeof bulletSchema>;
