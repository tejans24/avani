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

export type DetectorReport = Record<string, number>;

/** Run every registered detector. Extended as milestones land. */
export async function runDetectors(now = todayUtc()): Promise<DetectorReport> {
  return {
    overdueInvoices: await detectOverdueInvoices(now),
  };
}
