import { z } from "zod";

/**
 * The master résumé format (resume/master.json → ResumeMaster.data) and the
 * tailored variants (TailoredResume.data) share this shape.
 *
 * Every bullet carries a stable `id` so a tailored variant can be traced back
 * line by line to master: the diff view and the truthfulness check both work
 * from ids, never from fuzzy text matching. `skills` tags drive relevance
 * ranking when bullets are selected and reordered for a posting.
 *
 * `month` is "YYYY-MM"; `end: null` means "Present".
 */

const MONTH_RE = /^\d{4}-\d{2}$/;
const month = z.string().regex(MONTH_RE, "Use YYYY-MM");
const id = z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/, "Lowercase, digits, hyphens");

export const bulletSchema = z.object({
  id,
  text: z.string().trim().min(1).max(600),
  /** Skill tags, e.g. ["aws-serverless", "event-driven", "python"]. */
  skills: z.array(z.string().trim().min(1)).default([]),
});

export const experienceSchema = z.object({
  id,
  organization: z.string().trim().min(1),
  title: z.string().trim().min(1),
  location: z.string().trim().optional(),
  start: month,
  end: month.nullable(),
  bullets: z.array(bulletSchema).min(1),
});

export const projectSchema = z.object({
  id,
  name: z.string().trim().min(1),
  url: z.string().trim().optional(),
  bullets: z.array(bulletSchema).min(1),
});

export const resumeSchema = z.object({
  contact: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.email(),
    phone: z.string().trim().optional(),
    location: z.string().trim().optional(),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  }),
  summary: z.string().trim().min(1).max(1200),
  experience: z.array(experienceSchema).min(1),
  projects: z.array(projectSchema).default([]),
  /** Grouped skills, rendered as "Group: a, b, c" lines. */
  skills: z.array(z.object({ group: z.string().trim().min(1), items: z.array(z.string().trim().min(1)) })),
  education: z.array(
    z.object({
      id,
      institution: z.string().trim().min(1),
      degree: z.string().trim().min(1),
      year: z.string().trim().optional(),
    })
  ),
});

export type Resume = z.infer<typeof resumeSchema>;
export type ResumeBullet = z.infer<typeof bulletSchema>;
