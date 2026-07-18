import { db } from "@/lib/db";
import { emitEvent } from "./emit";
import { dateToIso, todayUtc } from "@/lib/dates";

/**
 * Payment-related detectors (owned by the matching milestone).
 * Wired into runDetectors in detectors.ts.
 */

/** Days past the due date before a missing payment is worth flagging. */
const GRACE_DAYS = 3;

/**
 * SENT invoices past due + GRACE_DAYS with no matched deposit and no prior
 * payment.missing event. Idempotent: the DomainEvent entityId check makes a
 * second tick a no-op, so the sweep can run as often as it likes.
 */
export async function detectMissingPayments(now: Date = todayUtc()): Promise<number> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // dueDate + GRACE_DAYS < today  ⇔  dueDate < today - GRACE_DAYS
  const cutoff = new Date(today.getTime() - GRACE_DAYS * 86400_000);

  const invoices = await db.invoice.findMany({
    where: {
      status: "SENT",
      dueDate: { lt: cutoff },
      matchedTransaction: { is: null },
    },
    include: { client: { select: { name: true } } },
  });

  let emitted = 0;
  for (const inv of invoices) {
    const prior = await db.domainEvent.findFirst({
      where: { type: "payment.missing", entityId: inv.id },
    });
    if (prior) continue;
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "payment.missing", {
        invoiceId: inv.id,
        number: inv.number,
        clientName: inv.client.name,
        totalCents: inv.totalCents,
        dueDateIso: dateToIso(inv.dueDate),
      });
    });
    emitted++;
  }
  return emitted;
}
