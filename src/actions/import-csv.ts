"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { csvImportSchema, type CsvImportInput } from "@/lib/validations";
import { assignOrdinals, csvDedupeKey } from "@/lib/transactions";
import { matchRule } from "@/lib/rules";
import { isoToUtcDate } from "@/lib/dates";
import { emitEvent } from "@/lib/events/emit";
import { dispatchSoon } from "@/lib/events/dispatch";

export type ImportResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; error: string };

/**
 * Import parsed CSV rows into an account's transactions.
 *
 * SIGN CONTRACT: `rows[].amountCents` arrives ALREADY sign-normalized to the
 * business perspective (+ money in, - money out). The CsvImportWizard applies
 * the "amounts are charges" flip (normalizeCsvAmount semantics) for both
 * display and submission, so the server applies NOTHING further to signs —
 * amounts are stored exactly as received.
 *
 * Everything else is recomputed server-side (never trust client rows for
 * identity or categorization): ordinals + dedupe keys are derived here, and
 * category rules are re-matched against each row's description.
 */
export async function importCsvRows(input: CsvImportInput): Promise<ImportResult> {
  try {
    await requireAuth();
    const parsed = csvImportSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { accountId, rows } = parsed.data;

    const account = await db.financialAccount.findUnique({ where: { id: accountId } });
    if (!account) return { ok: false, error: "Account not found." };

    // Server recomputes identity: ordinals over the submitted file, then
    // content-derived dedupe keys (unique per [accountId, dedupeKey]).
    const withOrdinals = assignOrdinals(rows);

    // Load all rules once; first match (priority order) wins per row.
    const rules = await db.categoryRule.findMany({ include: { category: true } });

    const data = withOrdinals.map((row) => ({
      accountId,
      postedAt: isoToUtcDate(row.dateIso),
      amountCents: row.amountCents,
      description: row.description,
      dedupeKey: csvDedupeKey(row),
      categoryId: matchRule({ description: row.description }, rules),
    }));
    // Categorized among ALL submitted rows (computed pre-dedupe by design).
    const categorized = data.filter((d) => d.categoryId !== null).length;

    const { imported, skipped } = await db.$transaction(async (tx) => {
      const result = await tx.transaction.createMany({
        data,
        skipDuplicates: true, // relies on @@unique([accountId, dedupeKey])
      });
      const counts = { imported: result.count, skipped: rows.length - result.count };
      if (counts.imported > 0) {
        await emitEvent(tx, "transactions.imported", {
          accountId,
          accountName: account.name,
          source: "CSV",
          imported: counts.imported,
          skipped: counts.skipped,
          categorized,
        });
      }
      return counts;
    });
    dispatchSoon();

    for (const p of ["/transactions", "/accounts", "/reports"]) {
      revalidatePath(p);
    }
    return { ok: true, imported, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
