import { db } from "@/lib/db";
import { emitEvent } from "./emit";
import { dateToIso, todayUtc } from "@/lib/dates";

/**
 * Time-based detectors: compare `now` against reality and emit facts nobody
 * clicked. Each detector is idempotent — it checks for a prior event before
 * emitting, so the tick can run as often as it likes.
 *
 * All detectors take `now` for testability. More detectors land with their
 * milestones (payment.missing, quarter windows, compliance windows, drafts).
 */

/** SENT invoices whose dueDate has passed and that have no overdue event yet. */
export async function detectOverdueInvoices(now = todayUtc()): Promise<number> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const overdue = await db.invoice.findMany({
    where: { status: "SENT", dueDate: { lt: today } },
    include: { client: { select: { id: true, name: true } } },
  });
  let emitted = 0;
  for (const inv of overdue) {
    const prior = await db.domainEvent.findFirst({
      where: { type: "invoice.overdue", entityId: inv.id },
    });
    if (prior) continue;
    const daysPast = Math.floor(
      (today.getTime() - inv.dueDate.getTime()) / 86400_000
    );
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "invoice.overdue", {
        invoiceId: inv.id,
        number: inv.number,
        clientId: inv.client.id,
        clientName: inv.client.name,
        totalCents: inv.totalCents,
        dueDateIso: dateToIso(inv.dueDate),
        daysPast,
      });
    });
    emitted++;
  }
  return emitted;
}

/**
 * Meta-alerting with a loop guard: when automations themselves fail (FAILED
 * HandlerRuns or delivery failures in the last 24h), raise ONE in-app
 * notification per day — created directly, never via an event, so a failing
 * notification pipeline can't recurse into more failures.
 */
export async function detectSystemFailures(now = new Date()): Promise<number> {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const [failedRuns, deliveryFails] = await Promise.all([
    db.handlerRun.count({ where: { status: "FAILED", ranAt: { gte: dayAgo } } }),
    db.notification.count({
      where: {
        createdAt: { gte: dayAgo },
        delivery: { not: undefined },
        OR: [
          { delivery: { path: ["email"], string_starts_with: "FAILED" } },
          { delivery: { path: ["sms"], string_starts_with: "FAILED" } },
        ],
      },
    }),
  ]);
  const total = failedRuns + deliveryFails;
  if (total === 0) return 0;

  const alreadyAlerted = await db.notification.findFirst({
    where: {
      title: { startsWith: "System: " },
      createdAt: { gte: dayAgo },
    },
  });
  if (alreadyAlerted) return 0;

  await db.notification.create({
    data: {
      tier: "action",
      title: `System: ${total} automation failure${total === 1 ? "" : "s"} in the last 24h`,
      body: `${failedRuns} failed reaction run${failedRuns === 1 ? "" : "s"}, ${deliveryFails} delivery failure${deliveryFails === 1 ? "" : "s"}. Review and retry from the failures view.`,
      href: "/activity?view=failures",
    },
  });
  return 1;
}

export type DetectorReport = Record<string, number>;

/** Run every registered detector. Extended as milestones land. */
export async function runDetectors(now = todayUtc()): Promise<DetectorReport> {
  const { detectMissingPayments } = await import("./detect-payments");
  const { detectQuarterWindows, detectComplianceWindows, detectDueDrafts } =
    await import("./detect-taxes");
  const { detectFollowupsDue, detectGoingCold } = await import("./detect-bd");
  return {
    overdueInvoices: await detectOverdueInvoices(now),
    missingPayments: await detectMissingPayments(now),
    quarterWindows: await detectQuarterWindows(now),
    complianceWindows: await detectComplianceWindows(now),
    dueDrafts: await detectDueDrafts(now),
    followupsDue: await detectFollowupsDue(now),
    goingCold: await detectGoingCold(now),
    systemFailures: await detectSystemFailures(now),
  };
}
