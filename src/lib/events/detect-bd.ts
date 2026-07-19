import { db } from "@/lib/db";
import { emitEvent } from "./emit";
import { dateToIso, todayUtc } from "@/lib/dates";
import { isGoingCold } from "@/lib/bd-playbook";

/**
 * Business-development coach detectors. They turn the passage of time into
 * nudges: a next action coming due, or a relationship going quiet. Both are
 * idempotent (they check for a prior event before emitting) so the tick can
 * run as often as it likes.
 */

function truncateUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Clients whose next action is due today or earlier (and not PAST). Dedupe key
 * is (client, dueDate): editing the action to a new date re-arms the nudge,
 * while re-ticking the same due date is a no-op.
 */
export async function detectFollowupsDue(now: Date = todayUtc()): Promise<number> {
  const today = truncateUtc(now);
  const clients = await db.client.findMany({
    where: {
      archived: false,
      stage: { not: "PAST" },
      nextActionDueDate: { not: null, lte: today },
    },
    select: { id: true, name: true, stage: true, nextActionNote: true, nextActionDueDate: true },
  });

  let emitted = 0;
  for (const c of clients) {
    if (!c.nextActionDueDate) continue;
    const dueIso = dateToIso(c.nextActionDueDate);
    const prior = await db.domainEvent.findFirst({
      where: {
        type: "client.followup_due",
        entityId: c.id,
        payload: { path: ["dueDateIso"], equals: dueIso },
      },
    });
    if (prior) continue;
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "client.followup_due", {
        clientId: c.id,
        clientName: c.name,
        stage: c.stage,
        note: c.nextActionNote?.trim() || "Follow up",
        dueDateIso: dueIso,
      });
    });
    emitted++;
  }
  return emitted;
}

/**
 * Open-pipeline clients (LEAD/PROSPECT) with no touch inside the stage's
 * cadence and no dated next action already scheduled. Emits once per cold
 * spell: after a going-cold nudge, it stays quiet until the client is
 * recontacted (a new interaction), which starts a fresh spell.
 */
export async function detectGoingCold(now: Date = todayUtc()): Promise<number> {
  const today = truncateUtc(now);
  const clients = await db.client.findMany({
    where: {
      archived: false,
      stage: { in: ["LEAD", "PROSPECT"] },
      // A scheduled next action is handled by the follow-up nudge instead.
      nextActionDueDate: null,
    },
    select: { id: true, name: true, stage: true, createdAt: true },
  });

  let emitted = 0;
  for (const c of clients) {
    const latest = await db.interaction.findFirst({
      where: { clientId: c.id },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    });
    const lastContactAt = latest?.occurredAt ?? null;
    if (!isGoingCold(c.stage, lastContactAt, today, c.createdAt)) continue;

    // One nudge per cold spell: skip if we've already flagged it and there's
    // been no interaction since (i.e. not recontacted).
    const lastCold = await db.domainEvent.findFirst({
      where: { type: "client.going_cold", entityId: c.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (lastCold) {
      const recontacted = lastContactAt != null && lastContactAt > lastCold.createdAt;
      if (!recontacted) continue;
    }

    const reference = lastContactAt ?? c.createdAt;
    const daysCold = Math.floor((today.getTime() - reference.getTime()) / 86_400_000);
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "client.going_cold", {
        clientId: c.id,
        clientName: c.name,
        stage: c.stage,
        daysCold,
      });
    });
    emitted++;
  }
  return emitted;
}
