"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export type TransactionStatusValue = "UNREVIEWED" | "REVIEWED" | "EXCLUDED";

const STATUS_VALUES: TransactionStatusValue[] = ["UNREVIEWED", "REVIEWED", "EXCLUDED"];

const MAX_BULK_IDS = 500;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function revalidateTransactions() {
  revalidatePath("/transactions");
  revalidatePath("/reports");
}

/**
 * Set (or clear) a transaction's category.
 *
 * Categorizing a previously UNREVIEWED transaction also flips its status to
 * REVIEWED — picking a category by hand *is* the review, so the owner doesn't
 * have to click twice. Clearing the category (categoryId = null) never touches
 * status.
 */
export async function setTransactionCategory(
  id: string,
  categoryId: string | null
): Promise<ActionResult> {
  try {
    await requireAuth();
    const existing = await db.transaction.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    await db.transaction.update({
      where: { id },
      data: {
        categoryId,
        ...(categoryId !== null && existing.status === "UNREVIEWED"
          ? { status: "REVIEWED" as const }
          : {}),
      },
    });
    revalidateTransactions();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Set a transaction's review status directly. */
export async function setTransactionStatus(
  id: string,
  status: TransactionStatusValue
): Promise<ActionResult> {
  try {
    await requireAuth();
    if (!STATUS_VALUES.includes(status)) {
      return { ok: false, error: "Invalid status" };
    }
    await db.transaction.update({ where: { id }, data: { status } });
    revalidateTransactions();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Bulk-update up to 500 transactions with a partial patch of category and/or
 * status. Mirrors the single-row rule: when the patch assigns a (non-null)
 * category and does not itself specify a status, any UNREVIEWED rows in the
 * selection are bumped to REVIEWED.
 */
export async function bulkUpdateTransactions(
  ids: string[],
  patch: { categoryId?: string | null; status?: TransactionStatusValue }
): Promise<ActionResult> {
  try {
    await requireAuth();
    if (!Array.isArray(ids) || ids.length === 0) {
      return { ok: false, error: "No transactions selected" };
    }
    if (ids.length > MAX_BULK_IDS) {
      return { ok: false, error: `Too many transactions selected (max ${MAX_BULK_IDS})` };
    }
    const hasCategory = "categoryId" in patch;
    const hasStatus = patch.status !== undefined;
    if (!hasCategory && !hasStatus) {
      return { ok: false, error: "Nothing to update" };
    }
    if (hasStatus && !STATUS_VALUES.includes(patch.status)) {
      return { ok: false, error: "Invalid status" };
    }

    await db.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { id: { in: ids } },
        data: {
          ...(hasCategory ? { categoryId: patch.categoryId } : {}),
          ...(hasStatus ? { status: patch.status } : {}),
        },
      });
      // Categorizing implies review (same as setTransactionCategory), unless
      // the caller explicitly set a status in this same patch.
      if (hasCategory && patch.categoryId != null && !hasStatus) {
        await tx.transaction.updateMany({
          where: { id: { in: ids }, status: "UNREVIEWED" },
          data: { status: "REVIEWED" },
        });
      }
    });

    revalidateTransactions();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
