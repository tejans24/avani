/**
 * Tax/compliance/auto-draft detectors (owned by the taxes milestone).
 * Wired into runDetectors in detectors.ts. Each detector is idempotent via
 * prior-DomainEvent checks, so the tick can run as often as it likes.
 */

import { db } from "@/lib/db";
import { dateToIso, isoToUtcDate } from "@/lib/dates";
import { windowOpen, daysUntil } from "@/lib/compliance";
import { computeYearEstimate } from "@/lib/tax-data";
import { prepareNextDraft } from "@/actions/auto-draft";
import { emitEvent } from "./emit";

const QUARTER_LEAD_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * Quarterly estimate windows opening: a quarter whose due date is within 14
 * days ahead of `now` and whose remaining amount is > 0 emits
 * "taxes.quarter_approaching" once per (year, quarter).
 *
 * Idempotence: quarter events have no entity row, so instead of an entityId
 * check (and because Prisma can't filter on a JSON payload path portably) we
 * load recent events of the type and filter by payload year/quarter in JS.
 * Q4 fires in January of the following calendar year, so the createdAt bound
 * reaches back a year rather than to Jan 1.
 */
export async function detectQuarterWindows(now: Date): Promise<number> {
  const { year, estimate } = await computeYearEstimate(now);
  const nowMid = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const due = estimate.schedule.filter((s) => {
    const days = Math.round(
      (isoToUtcDate(s.quarter.dueDateIso).getTime() - nowMid) / DAY_MS
    );
    return days >= 0 && days <= QUARTER_LEAD_DAYS && s.remainingCents > 0;
  });
  if (due.length === 0) return 0;

  const priorEvents = await db.domainEvent.findMany({
    where: {
      type: "taxes.quarter_approaching",
      createdAt: { gte: new Date(now.getTime() - 366 * DAY_MS) },
    },
    select: { payload: true },
  });
  const alreadyEmitted = new Set(
    priorEvents.map((e) => {
      const p = e.payload as { year?: number; quarter?: number };
      return `${p.year}-${p.quarter}`;
    })
  );

  let emitted = 0;
  for (const s of due) {
    if (alreadyEmitted.has(`${year}-${s.quarter.quarter}`)) continue;
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "taxes.quarter_approaching", {
        year,
        quarter: s.quarter.quarter,
        dueDateIso: s.quarter.dueDateIso,
        estimatedRemainingCents: s.remainingCents,
      });
    });
    emitted++;
  }
  return emitted;
}

/**
 * Compliance deadlines whose lead window opened. One event per deadline key,
 * ever — emit.ts maps payload.deadlineKey to entityType "deadline" /
 * entityId = key, so the prior-event check is a plain entityId lookup.
 * (Next year's instance of the same form is a new row with a new key.)
 */
export async function detectComplianceWindows(now: Date): Promise<number> {
  const deadlines = await db.complianceDeadline.findMany({ where: { enabled: true } });
  let emitted = 0;
  for (const d of deadlines) {
    if (!windowOpen(d, now)) continue;
    const prior = await db.domainEvent.findFirst({
      where: { type: "compliance.window_open", entityId: d.key },
    });
    if (prior) continue;
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "compliance.window_open", {
        deadlineKey: d.key,
        title: d.title,
        dueDateIso: dateToIso(d.dueDate),
        daysUntil: daysUntil(d, now),
      });
    });
    emitted++;
  }
  return emitted;
}

/**
 * Clients with a billing cadence whose next draft is due. The creation logic
 * (and all its guards — no invoices yet, not due, existing draft blocks) lives
 * in prepareNextDraft; this loop just counts what it created. Idempotence
 * comes from the existing-DRAFT guard rather than an event check: the draft
 * itself is the fact that blocks re-creation.
 */
export async function detectDueDrafts(now: Date): Promise<number> {
  const clients = await db.client.findMany({
    where: { billingCadenceDays: { not: null }, archived: false },
    select: { id: true },
  });
  let created = 0;
  for (const c of clients) {
    if (await prepareNextDraft(c.id, now)) created++;
  }
  return created;
}
