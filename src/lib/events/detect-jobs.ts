import { db } from "@/lib/db";
import { emitEvent } from "./emit";
import { dateToIso, todayUtc } from "@/lib/dates";
import { ACTIVE_STATUSES, APPLIED_STALE_DAYS, isStaleApplication, JOB_STATUS_LABEL, type JobStatus } from "@/lib/jobs/pipeline";

/**
 * Job pipeline detectors: follow-ups coming due and applications gone quiet.
 * Idempotent like the BD detectors, so the tick can run as often as it likes.
 * They only ever remind the owner; nothing is sent to an employer.
 */

function truncateUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Dedupe key is (posting, due date): a new date re-arms the nudge. */
export async function detectJobFollowupsDue(now: Date = todayUtc()): Promise<number> {
  const today = truncateUtc(now);
  const postings = await db.jobPosting.findMany({
    where: { archivedAt: null, status: { in: ACTIVE_STATUSES }, nextActionDue: { not: null, lte: today } },
    select: { id: true, title: true, status: true, nextActionNote: true, nextActionDue: true, company: { select: { name: true } } },
  });
  let emitted = 0;
  for (const p of postings) {
    if (!p.nextActionDue) continue;
    const dueIso = dateToIso(p.nextActionDue);
    const prior = await db.domainEvent.findFirst({
      where: { type: "job.followup_due", entityId: p.id, payload: { path: ["dueDateIso"], equals: dueIso } },
    });
    if (prior) continue;
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "job.followup_due", {
        postingId: p.id,
        title: p.title,
        companyName: p.company.name,
        status: JOB_STATUS_LABEL[p.status as JobStatus],
        note: p.nextActionNote?.trim() || "Follow up",
        dueDateIso: dueIso,
      });
    });
    emitted++;
  }
  return emitted;
}

/**
 * APPLIED postings with no activity for APPLIED_STALE_DAYS. Once per quiet
 * spell: any new activity (or status change) after the nudge re-arms it.
 */
export async function detectStaleApplications(now: Date = new Date()): Promise<number> {
  const postings = await db.jobPosting.findMany({
    where: { archivedAt: null, status: "APPLIED" },
    select: {
      id: true,
      title: true,
      status: true,
      appliedAt: true,
      statusChangedAt: true,
      createdAt: true,
      company: { select: { name: true } },
      activity: { orderBy: { occurredAt: "desc" }, take: 1, select: { occurredAt: true } },
    },
  });
  let emitted = 0;
  for (const p of postings) {
    const last = [p.activity[0]?.occurredAt, p.statusChangedAt, p.appliedAt, p.createdAt]
      .filter((d): d is Date => d instanceof Date)
      .reduce((a, b) => (b > a ? b : a));
    if (!isStaleApplication("APPLIED", last, now)) continue;
    const prior = await db.domainEvent.findFirst({
      where: { type: "job.application_stale", entityId: p.id, createdAt: { gt: last } },
    });
    if (prior) continue;
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "job.application_stale", {
        postingId: p.id,
        title: p.title,
        companyName: p.company.name,
        daysQuiet: Math.max(APPLIED_STALE_DAYS, Math.floor((now.getTime() - last.getTime()) / 86_400_000)),
      });
    });
    emitted++;
  }
  return emitted;
}
