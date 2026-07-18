"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { dateToIso } from "@/lib/dates";
import { emitEvent } from "@/lib/events/emit";
import { dispatchSoon } from "@/lib/events/dispatch";
import type { ActionResult } from "@/actions/invoices";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function revalidateMatchPaths(invoiceId: string) {
  for (const p of [
    "/transactions",
    "/invoices",
    `/invoices/${invoiceId}`,
    "/dashboard",
    "/reports",
  ]) {
    revalidatePath(p);
  }
}

/**
 * Confirm that a bank deposit pays an invoice: the invoice becomes PAID (as of
 * the deposit's posted date), the transaction is linked, categorized as Client
 * Revenue, and marked reviewed — all in one transaction with the events.
 */
export async function confirmInvoiceMatch(
  transactionId: string,
  invoiceId: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    const txn = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { client: { select: { name: true } } },
    });

    if (invoice.status !== "SENT") {
      return { ok: false, error: "Only sent invoices can be matched to a deposit." };
    }
    if (txn.matchedInvoiceId) {
      return { ok: false, error: "This transaction is already matched to an invoice." };
    }
    if (txn.amountCents <= 0) {
      return { ok: false, error: "Only deposits can be matched to an invoice." };
    }

    const revenueCategory = await db.category.findUniqueOrThrow({
      where: { name: "Client Revenue" },
      select: { id: true },
    });

    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "PAID", paidAt: txn.postedAt },
      });
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          matchedInvoiceId: invoiceId,
          categoryId: revenueCategory.id,
          status: "REVIEWED",
        },
      });
      await emitEvent(tx, "invoice.paid", {
        invoiceId,
        number: invoice.number,
        clientName: invoice.client.name,
        totalCents: invoice.totalCents,
        paidAtIso: dateToIso(txn.postedAt),
        via: "match",
      });
      await emitEvent(tx, "transaction.matched", {
        transactionId,
        invoiceId,
        invoiceNumber: invoice.number,
      });
    });

    dispatchSoon();
    revalidateMatchPaths(invoiceId);
    return { ok: true, id: invoiceId };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Undo a confirmed match: the invoice returns to SENT (paidAt cleared) and the
 * transaction is unlinked. The category and reviewed status are kept — the
 * deposit is still real money; only the invoice linkage was wrong.
 *
 * No event is emitted on purpose: unlink corrects a mis-click rather than
 * recording a business fact, and the append-only log keeps the original
 * paid/matched events as history.
 */
export async function unlinkInvoiceMatch(transactionId: string): Promise<ActionResult> {
  try {
    await requireAuth();

    const txn = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    if (!txn.matchedInvoiceId) {
      return { ok: false, error: "This transaction is not matched to an invoice." };
    }
    const invoiceId = txn.matchedInvoiceId;
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.status !== "PAID") {
      return { ok: false, error: "Only paid invoices can be unlinked." };
    }

    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "SENT", paidAt: null },
      });
      await tx.transaction.update({
        where: { id: transactionId },
        data: { matchedInvoiceId: null },
      });
    });

    revalidateMatchPaths(invoiceId);
    return { ok: true, id: invoiceId };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
