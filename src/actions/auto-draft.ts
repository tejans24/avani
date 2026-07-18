/**
 * Draft-preparation logic for the biweekly (billingCadenceDays) automation.
 *
 * Deliberately NOT a "use server" file: these functions are internal machinery
 * called by the tick's detector (detect-taxes.ts), never invoked from the
 * client. Marking the file "use server" would expose every export as an
 * unauthenticated RPC endpoint; as a plain server module it stays callable
 * only from server code.
 */

import { db } from "@/lib/db";
import { dateToIso } from "@/lib/dates";
import { allocateInvoiceNumber } from "@/lib/invoice-numbering";
import { shiftDescriptionDates } from "@/lib/shift-dates";
import { emitEvent } from "@/lib/events/emit";

function addDaysUtc(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Prepare the client's next DRAFT invoice from their latest invoice, using the
 * same duplicate-for-next-period mechanics as duplicateInvoice(shiftDays):
 * new number via allocateInvoiceNumber, issue/due dates shifted +cadence days,
 * MM/DD/YY date ranges in line-item descriptions and the memo shifted too,
 * totals copied. Emits "invoice.draft_prepared" in the same transaction.
 *
 * Guards (all here so the detector stays a thin loop):
 * - client must exist, be active, and have a cadence configured;
 * - cadence starts from the first MANUAL invoice — no invoices yet, no draft;
 * - next issue date (latest issueDate + cadence) must be <= now;
 * - an existing DRAFT for the client blocks a new one (review the pending
 *   draft first; the next tick after it's sent prepares the following one).
 *
 * Returns the created draft, or null when any guard declined.
 */
export async function prepareNextDraft(
  clientId: string,
  now: Date
): Promise<{ id: string; number: string } | null> {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client || client.archived || client.billingCadenceDays == null) return null;
  const shift = client.billingCadenceDays;

  const source = await db.invoice.findFirst({
    where: { clientId },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return null;

  const issueDate = addDaysUtc(source.issueDate, shift);
  if (dateToIso(issueDate) > dateToIso(now)) return null;

  const existingDraft = await db.invoice.findFirst({
    where: { clientId, status: "DRAFT" },
  });
  if (existingDraft) return null;

  const dueDate = addDaysUtc(source.dueDate, shift);

  const created = await db.$transaction(async (tx) => {
    const number = await allocateInvoiceNumber(tx);
    const invoice = await tx.invoice.create({
      data: {
        number,
        clientId,
        status: "DRAFT",
        issueDate,
        dueDate,
        taxRateBps: source.taxRateBps,
        subtotalCents: source.subtotalCents,
        taxCents: source.taxCents,
        totalCents: source.totalCents,
        memo: source.memo ? shiftDescriptionDates(source.memo, shift) : source.memo,
        lineItems: {
          create: source.lineItems.map((item, i) => ({
            description: shiftDescriptionDates(item.description, shift),
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            amountCents: item.amountCents,
            sortOrder: i,
          })),
        },
      },
    });
    await emitEvent(tx, "invoice.draft_prepared", {
      invoiceId: invoice.id,
      number,
      clientName: client.name,
      totalCents: invoice.totalCents,
    });
    return invoice;
  });

  return { id: created.id, number: created.number };
}
