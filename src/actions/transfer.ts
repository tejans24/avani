"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { ActionResult } from "@/actions/invoices";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function revalidateTransferPaths() {
  for (const p of ["/transactions", "/reports", "/reports/pnl", "/dashboard"]) {
    revalidatePath(p);
  }
}

/**
 * Confirm that two transactions are the two legs of one account-to-account
 * transfer (e.g. a bank payment settling a credit-card balance). Both legs are
 * booked as "Transfer Between Accounts" (kind TRANSFER, taxLine NONE) and
 * linked by a shared transferGroupId — so neither counts in P&L or taxes and
 * the underlying card charges aren't double-counted.
 */
export async function confirmTransfer(
  transactionAId: string,
  transactionBId: string
): Promise<ActionResult> {
  try {
    await requireAuth();
    if (transactionAId === transactionBId) {
      return { ok: false, error: "A transfer needs two different transactions." };
    }

    const [a, b] = await Promise.all([
      db.transaction.findUniqueOrThrow({ where: { id: transactionAId } }),
      db.transaction.findUniqueOrThrow({ where: { id: transactionBId } }),
    ]);

    if (a.accountId === b.accountId) {
      return { ok: false, error: "Both legs are on the same account — not a transfer." };
    }
    if (a.amountCents !== -b.amountCents) {
      return { ok: false, error: "The two legs must be equal and opposite amounts." };
    }
    if (a.matchedInvoiceId || b.matchedInvoiceId) {
      return { ok: false, error: "One of these is already matched to an invoice." };
    }
    if (a.transferGroupId || b.transferGroupId) {
      return { ok: false, error: "One of these is already part of a transfer." };
    }

    const transferCategory = await db.category.findUniqueOrThrow({
      where: { name: "Transfer Between Accounts" },
      select: { id: true },
    });
    const groupId = randomUUID();

    // Conditional atomic pairing: both legs must still be unpaired, so a race
    // (either leg matched into another transfer meanwhile) can't double-book.
    const paired = await db.$transaction(async (tx) => {
      const res = await tx.transaction.updateMany({
        where: {
          id: { in: [transactionAId, transactionBId] },
          transferGroupId: null,
          matchedInvoiceId: null,
        },
        data: {
          categoryId: transferCategory.id,
          status: "REVIEWED",
          transferGroupId: groupId,
        },
      });
      return res.count === 2;
    });
    if (!paired) {
      return { ok: false, error: "These transactions are no longer both available to pair." };
    }

    revalidateTransferPaths();
    return { ok: true, id: groupId };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Undo a confirmed transfer: both legs return to UNREVIEWED + uncategorized. */
export async function unlinkTransfer(transactionId: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const txn = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    if (!txn.transferGroupId) {
      return { ok: false, error: "This transaction isn't part of a transfer." };
    }
    await db.transaction.updateMany({
      where: { transferGroupId: txn.transferGroupId },
      data: { categoryId: null, status: "UNREVIEWED", transferGroupId: null },
    });
    revalidateTransferPaths();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
