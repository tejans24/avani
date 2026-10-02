"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { isoToUtcDate } from "@/lib/dates";
import { BENEFITS, type BenefitKey } from "@/lib/jobs/benefits";
import { canonicalJobUrl, parseCapture, type CapturePayload } from "@/lib/jobs/capture";
import { canDeletePosting } from "@/lib/jobs/dedupe";
import { defaultNextAction, type JobStatus } from "@/lib/jobs/pipeline";
import { ingestPostings, refreshBoard, rescorePosting } from "@/lib/jobs/refresh";
import { INTERVIEW_QUESTIONS, type Lane, type WorkMode } from "@/lib/jobs/scoring-config";
import type { BreakdownEntry } from "@/lib/jobs/scoring";
import { sourceFetchCtx } from "@/lib/jobs/sources/http";

export type ActionResult = { ok: true; id?: string; note?: string } | { ok: false; error: string };

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong" });

const JOB_STATUSES = ["NEW", "SHORTLISTED", "APPLIED", "INTERVIEWING", "OFFER", "CLOSED", "SKIPPED"] as const;
const LANES = ["GOV_CONTRACTOR", "COMMERCIAL_PLATFORM", "HEALTH_SYSTEM", "CLIMATE_CONSERVATION", "INTERNAL_TOOLS", "UNCLASSIFIED"] as const;
const ACTIVITY_KINDS = ["INTERVIEW", "RECRUITER_CONTACT", "FOLLOW_UP", "NOTE"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function revalidateJob(id?: string) {
  revalidatePath("/jobs");
  if (id) revalidatePath(`/jobs/${id}`);
}

// --- Pipeline ---------------------------------------------------------------

const statusSchema = z.object({
  status: z.enum(JOB_STATUSES),
  note: z.string().trim().max(2000).optional(),
  occurredOn: isoDate.optional(),
});

/**
 * Change status, log it, and set the default follow-up for the new status
 * (pipeline.ts). Marking Applied records the date; the app never applies.
 */
export async function setJobStatus(id: string, input: z.input<typeof statusSchema>): Promise<ActionResult> {
  try {
    await requireAuth();
    const { status, note, occurredOn } = statusSchema.parse(input);
    const posting = await db.jobPosting.findUniqueOrThrow({ where: { id }, select: { status: true, appliedAt: true } });
    const when = occurredOn ? isoToUtcDate(occurredOn) : new Date();
    const next = defaultNextAction(status as JobStatus, when);
    await db.$transaction([
      db.jobPosting.update({
        where: { id },
        data: {
          status,
          statusChangedAt: when,
          ...(status === "APPLIED" && !posting.appliedAt ? { appliedAt: when } : {}),
          nextActionNote: next?.note ?? null,
          nextActionDue: next?.due ?? null,
          ...(status === "SKIPPED" || status === "CLOSED" ? {} : { archivedAt: null }),
        },
      }),
      db.jobActivity.create({
        data: { postingId: id, kind: "STATUS_CHANGE", fromStatus: posting.status, toStatus: status, occurredAt: when, note: note || null },
      }),
    ]);
    revalidateJob(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const activitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  note: z.string().trim().min(1, "Add a note").max(4000),
  occurredOn: isoDate,
  nextActionNote: z.string().trim().max(300).optional(),
  nextActionDue: isoDate.optional().or(z.literal("")),
});

export async function addJobActivity(id: string, input: z.input<typeof activitySchema>): Promise<ActionResult> {
  try {
    await requireAuth();
    const a = activitySchema.parse(input);
    await db.$transaction([
      db.jobActivity.create({ data: { postingId: id, kind: a.kind, occurredAt: isoToUtcDate(a.occurredOn), note: a.note } }),
      ...(a.nextActionDue
        ? [db.jobPosting.update({ where: { id }, data: { nextActionNote: a.nextActionNote || "Follow up", nextActionDue: isoToUtcDate(a.nextActionDue) } })]
        : []),
    ]);
    revalidateJob(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteJobActivity(postingId: string, activityId: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.jobActivity.delete({ where: { id: activityId, postingId } });
    revalidateJob(postingId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const nextActionSchema = z.object({ note: z.string().trim().max(300), due: isoDate.or(z.literal("")) });

export async function setJobNextAction(id: string, input: z.input<typeof nextActionSchema>): Promise<ActionResult> {
  try {
    await requireAuth();
    const { note, due } = nextActionSchema.parse(input);
    await db.jobPosting.update({
      where: { id },
      data: { nextActionNote: note || null, nextActionDue: due ? isoToUtcDate(due) : null },
    });
    revalidateJob(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const notesSchema = z.object({ notes: z.string().max(20_000), tailoringNotes: z.string().max(4000) });

export async function setJobNotes(id: string, input: z.input<typeof notesSchema>): Promise<ActionResult> {
  try {
    await requireAuth();
    const { notes, tailoringNotes } = notesSchema.parse(input);
    await db.jobPosting.update({ where: { id }, data: { notes: notes.trim() || null, tailoringNotes: tailoringNotes.trim() || null } });
    revalidateJob(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Manual lane correction (null clears it); rescoring uses the new lane. */
export async function setJobLane(id: string, lane: Lane | null): Promise<ActionResult> {
  try {
    await requireAuth();
    const laneOverride = lane === null ? null : z.enum(LANES).parse(lane);
    await db.jobPosting.update({ where: { id }, data: { laneOverride } });
    await rescorePosting(id, new Date());
    revalidateJob(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// --- Archive / delete --------------------------------------------------------

export async function setJobArchived(id: string, archived: boolean): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.jobPosting.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    revalidateJob(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Permanent delete with a tombstone so refreshes never bring it back. Refused
 * for anything with an application on record (archive instead).
 */
export async function deleteJob(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const p = await db.jobPosting.findUniqueOrThrow({ where: { id }, include: { company: true, aliases: true } });
    if (!canDeletePosting(p)) {
      return { ok: false, error: "You applied to this one, so it keeps its history. Archive it instead." };
    }
    await db.$transaction([
      db.jobDismissal.upsert({
        where: { source_sourceJobId: { source: p.source, sourceJobId: p.sourceJobId } },
        create: { source: p.source, sourceJobId: p.sourceJobId, dedupeKey: p.dedupeKey, title: p.title, companyName: p.company.name },
        update: {},
      }),
      ...p.aliases.map((a) =>
        db.jobDismissal.upsert({
          where: { source_sourceJobId: { source: a.source, sourceJobId: a.sourceJobId } },
          create: { source: a.source, sourceJobId: a.sourceJobId, dedupeKey: p.dedupeKey, title: p.title, companyName: p.company.name },
          update: {},
        })
      ),
      db.jobPosting.delete({ where: { id } }),
    ]);
    revalidateJob();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// --- Company: verify-on-the-call answers, benefits, staffing flag ------------

const questionKeys = INTERVIEW_QUESTIONS.map((q) => q.key) as [string, ...string[]];
const answersSchema = z.record(z.enum(questionKeys), z.string().trim().max(2000));

export async function setCompanyAnswers(companyId: string, answers: Record<string, string>, postingId?: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = answersSchema.parse(answers);
    const clean = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v));
    await db.jobCompany.update({ where: { id: companyId }, data: { questions: clean } });
    revalidateJob(postingId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const benefitKeys = BENEFITS.map((b) => b.key) as [BenefitKey, ...BenefitKey[]];
const benefitsSchema = z.record(z.enum(benefitKeys), z.object({ value: z.string().trim().max(80).optional(), note: z.string().trim().max(300).optional() }));

/** Owner-entered benefits (from a recruiter or offer); these win over extracted ones. */
export async function setCompanyBenefits(companyId: string, benefits: Record<string, { value?: string; note?: string }>, postingId?: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = benefitsSchema.parse(benefits);
    const clean = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v.value || v.note));
    await db.jobCompany.update({ where: { id: companyId }, data: { benefits: clean as Prisma.InputJsonValue } });
    revalidateJob(postingId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Flagging a staffing agency filters out all of its postings (rescored now). */
export async function setCompanyStaffingAgency(companyId: string, isStaffingAgency: boolean): Promise<ActionResult> {
  try {
    await requireAuth();
    const company = await db.jobCompany.update({ where: { id: companyId }, data: { isStaffingAgency }, select: { postings: { select: { id: true } } } });
    const now = new Date();
    for (const p of company.postings) await rescorePosting(p.id, now);
    revalidateJob();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// --- Manual capture -----------------------------------------------------------

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

/**
 * Try fetching a job page server-side (works for most company career sites).
 * Sites that block it (LinkedIn, Indeed) return an error and the capture page
 * asks for pasted text instead.
 */
export async function fetchCaptureDraft(url: string): Promise<{ ok: true; payload: CapturePayload } | { ok: false; error: string }> {
  try {
    await requireAuth();
    const u = new URL(url.trim());
    if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) return { ok: false, error: "That address can't be fetched." };
    const res = await fetch(u, {
      headers: { "User-Agent": "AvaniJobFinder/1.0 (personal job search)", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, error: `The site answered ${res.status}. Paste the job text instead.` };
    const html = (await res.text()).slice(0, 2_000_000);
    const jsonLd: unknown[] = [];
    for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        jsonLd.push(JSON.parse(m[1].trim()));
      } catch {
        /* malformed block: ignore */
      }
    }
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const body = html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/\n\s*\n+/g, "\n")
      .trim()
      .slice(0, 60_000);
    return { ok: true, payload: { url: u.toString(), pageTitle: title, text: body, jsonLd } };
  } catch {
    return { ok: false, error: "Couldn't load that page. Paste the job text instead." };
  }
}

const captureSchema = z.object({
  url: z.string().trim().url("Enter the job's link"),
  title: z.string().trim().min(1, "Add the job title").max(300),
  companyName: z.string().trim().min(1, "Add the company").max(200),
  location: z.string().trim().min(1, "Add the location (or Remote)").max(200),
  descriptionText: z.string().trim().min(20, "Paste the job description").max(100_000),
  postedOn: isoDate.optional().or(z.literal("")),
  compMin: z.number().int().positive().optional(),
  compMax: z.number().int().positive().optional(),
  capturedVia: z.enum(["bookmarklet", "share", "shortcut", "paste"]),
  jsonLd: z.unknown().optional(),
});

/**
 * Save a confirmed capture. Duplicates are rejected: if the job already
 * exists (from a feed or an earlier capture) this opens the existing one.
 */
export async function captureJob(input: z.input<typeof captureSchema>): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = captureSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const c = parsed.data;
    const url = canonicalJobUrl(c.url);
    const now = new Date();
    const report = await ingestPostings(
      [
        {
          source: "MANUAL",
          sourceJobId: url,
          title: c.title,
          companyName: c.companyName,
          location: c.location,
          workModeHint: null,
          url,
          descriptionText: c.descriptionText,
          postedAt: c.postedOn ? isoToUtcDate(c.postedOn) : null,
          compMinCents: c.compMin ? c.compMin * 100 : null,
          compMaxCents: c.compMax ? c.compMax * 100 : null,
          capturedVia: c.capturedVia,
          raw: { capturedVia: c.capturedVia, jsonLd: c.jsonLd ?? null },
        },
      ],
      { now }
    );
    revalidateJob();
    if (report.created[0]) return { ok: true, id: report.created[0].id };
    const existing = [...report.seenPostingIds][0];
    if (existing) return { ok: true, id: existing, note: "You already have this job, so it opened the existing one." };
    if (report.dismissed) return { ok: false, error: "You deleted this job earlier, so it wasn't added again." };
    return { ok: false, error: "Couldn't save that job." };
  } catch (e) {
    return fail(e);
  }
}

/** Preview helper for the capture form (pure parse, no writes). */
export async function previewCapture(payload: CapturePayload) {
  await requireAuth();
  return parseCapture(payload);
}

// --- Boards -------------------------------------------------------------------

const boardSchema = z.object({
  source: z.enum(["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "WORKDAY", "USAJOBS"]),
  slug: z.string().trim().min(1, "Add the board id").max(300),
  host: z.string().trim().max(200).optional(),
  companyName: z.string().trim().min(1, "Add the company name").max(200),
});

export async function addJobBoard(input: z.input<typeof boardSchema>): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = boardSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const b = parsed.data;
    if (b.source === "WORKDAY" && (!b.host || b.slug.split("/").length !== 2)) {
      return { ok: false, error: "Workday needs the host (acme.wd5.myworkdayjobs.com) and tenant/site (acme/External). Run the verify script first." };
    }
    const board = await db.jobBoard.upsert({
      where: { source_slug: { source: b.source, slug: b.slug } },
      create: { source: b.source, slug: b.slug, host: b.host || null, companyName: b.companyName },
      update: { companyName: b.companyName, host: b.host || null, enabled: true },
    });
    revalidatePath("/jobs/boards");
    return { ok: true, id: board.id };
  } catch (e) {
    return fail(e);
  }
}

export async function setJobBoardEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.jobBoard.update({ where: { id }, data: { enabled } });
    revalidatePath("/jobs/boards");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteJobBoard(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.jobBoard.delete({ where: { id } });
    revalidatePath("/jobs/boards");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Fetch one board now ("Test" / "Refresh now"); reports what happened. */
export async function refreshJobBoardNow(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const r = await refreshBoard(id, sourceFetchCtx(new Date()));
    revalidatePath("/jobs/boards");
    revalidateJob();
    if (!r.ok) return { ok: false, error: r.error ?? "Fetch failed" };
    const rep = r.report!;
    return { ok: true, note: `${rep.created.length} new, ${rep.refreshed} refreshed, ${rep.aliased} duplicates merged.` };
  } catch (e) {
    return fail(e);
  }
}

// --- Federal award queries ----------------------------------------------------

export async function setAwardQueryEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.awardQuery.update({ where: { id }, data: { enabled } });
    revalidatePath("/jobs/awards");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function refreshAwardQueryNow(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const { refreshAwardQuery } = await import("@/lib/jobs/awards-refresh");
    const r = await refreshAwardQuery(id, sourceFetchCtx(new Date()));
    const now = new Date();
    for (const companyId of r.touchedCompanies) {
      const postings = await db.jobPosting.findMany({ where: { companyId, closedAt: null }, select: { id: true } });
      for (const p of postings) await rescorePosting(p.id, now);
    }
    revalidatePath("/jobs/awards");
    if (!r.ok) return { ok: false, error: r.error ?? "Fetch failed" };
    return { ok: true, note: `${r.found} awards, ${r.newAwards} new.` };
  } catch (e) {
    return fail(e);
  }
}

// --- Claude-assisted capture ------------------------------------------------------

/**
 * Read a job page's text with Claude when it has no structured job data.
 * Runs server-side; the owner's contact details (from the master résumé, if
 * imported) are scrubbed from the page text before it is sent.
 */
export async function fillCaptureWithClaude(input: { pageTitle?: string; text: string }) {
  try {
    await requireAuth();
    const text = z.string().trim().min(40, "Not enough page text to read").max(60_000).parse(input.text);
    const { extractJobWithClaude } = await import("@/lib/jobs/capture-ai");
    const { resumeSchema } = await import("@/lib/jobs/resume-schema");
    const master = await db.resumeMaster.findFirst({ orderBy: { version: "desc" }, select: { data: true } });
    const parsed = master ? resumeSchema.safeParse(master.data) : null;
    const r = await extractJobWithClaude({ pageTitle: input.pageTitle, text, contact: parsed?.success ? parsed.data.contact : null });
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Couldn't read the page" };
  }
}

/**
 * Claude's read on how this job fits the owner's goals and résumé. Kept on
 * the posting until run again. Contact details never leave (fit-ai.ts).
 */
export async function analyzeJobFit(postingId: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const posting = await db.jobPosting.findUnique({ where: { id: postingId }, include: { company: { select: { name: true } } } });
    if (!posting) return { ok: false, error: "Job not found" };
    const master = await db.resumeMaster.findFirst({ orderBy: { version: "desc" }, select: { data: true } });
    if (!master) return { ok: false, error: "Import your master résumé first (Jobs → Résumé) so the analysis can compare it." };
    const { resumeSchema } = await import("@/lib/jobs/resume-schema");
    const { analyzeFitWithClaude } = await import("@/lib/jobs/fit-ai");
    const now = new Date();
    const analysis = await analyzeFitWithClaude({
      master: resumeSchema.parse(master.data),
      posting: {
        title: posting.title,
        companyName: posting.company.name,
        location: posting.location,
        workMode: posting.workMode as WorkMode,
        compMinCents: posting.compMinCents,
        compMaxCents: posting.compMaxCents,
        postedAt: posting.postedAt,
        url: posting.url,
        filterFailures: posting.filterFailures,
        descriptionText: posting.descriptionText,
        lane: posting.lane as Lane,
        tailoringNotes: posting.tailoringNotes,
      },
      breakdown: posting.scoreBreakdown as unknown as BreakdownEntry[],
      now,
    });
    await db.jobPosting.update({
      where: { id: postingId },
      data: { fitAnalysis: analysis as unknown as Prisma.InputJsonValue, fitAnalyzedAt: now },
    });
    revalidateJob(postingId);
    return { ok: true, id: postingId };
  } catch (e) {
    return fail(e);
  }
}
