"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  fetchMercuryAccounts,
  fetchMercuryTransactions,
} from "@/lib/mercury";
import { mercuryDedupeKey } from "@/lib/transactions";
import { matchRule } from "@/lib/rules";
import { emitEvent } from "@/lib/events/emit";
import { dispatchSoon } from "@/lib/events/dispatch";

export type MercurySyncResult =
  | { ok: true; accountsUpserted: number; imported: number; skipped: number }
  | { ok: false; error: string };

/**
 * Pull accounts + transactions from Mercury and import anything new.
 *
 * - Accounts are upserted by mercuryAccountId (source MERCURY_API).
 * - Only status === "sent" transactions import; pending/cancelled are ignored
 *   (a pending txn imports on a later sync once it settles to "sent").
 * - Amounts: Mercury reports signed DOLLARS already in the business's
 *   perspective (credit +, debit −) — see src/lib/transactions.ts — so they
 *   convert to cents with no sign flip.
 * - Idempotent via dedupeKey "mercury:<id>" (unique per account). Existing
 *   keys are counted as skipped; createMany(skipDuplicates) is kept as a
 *   belt-and-suspenders guard against concurrent syncs.
 * - CategoryRules are applied at import time (matchRule).
 */
export async function syncMercury(): Promise<MercurySyncResult> {
  try {
    await requireAuth();

    const accounts = await fetchMercuryAccounts();
    const rules = await db.categoryRule.findMany();

    let imported = 0;
    let skipped = 0;
    let anyImported = false;

    for (const acct of accounts) {
      const mask = acct.accountNumber?.slice(-4) ?? null;
      const account = await db.financialAccount.upsert({
        where: { mercuryAccountId: acct.id },
        update: { name: acct.name, mask },
        create: {
          name: acct.name,
          kind: "BANK",
          institution: "Mercury",
          mask,
          source: "MERCURY_API",
          mercuryAccountId: acct.id,
        },
      });

      const txns = await fetchMercuryTransactions(acct.id);
      const rows = txns
        .filter((t) => t.status === "sent")
        .map((t) => {
          const description =
            t.bankDescription ?? t.counterpartyName ?? "Mercury transaction";
          return {
            accountId: account.id,
            postedAt: new Date(t.postedAt ?? t.createdAt),
            amountCents: Math.round(t.amount * 100),
            description,
            merchant: t.counterpartyName,
            dedupeKey: mercuryDedupeKey(t.id),
            categoryId: matchRule({ description, merchant: t.counterpartyName }, rules),
          };
        });

      const existing = new Set(
        (
          await db.transaction.findMany({
            where: {
              accountId: account.id,
              dedupeKey: { in: rows.map((r) => r.dedupeKey) },
            },
            select: { dedupeKey: true },
          })
        ).map((r) => r.dedupeKey)
      );
      const fresh = rows.filter((r) => !existing.has(r.dedupeKey));

      if (fresh.length > 0) {
        await db.transaction.createMany({ data: fresh, skipDuplicates: true });
      }

      const acctImported = fresh.length;
      const acctSkipped = rows.length - fresh.length;
      imported += acctImported;
      skipped += acctSkipped;

      if (acctImported > 0) {
        anyImported = true;
        await db.$transaction(async (tx) => {
          await emitEvent(tx, "transactions.imported", {
            accountId: account.id,
            accountName: account.name,
            source: "MERCURY_API",
            imported: acctImported,
            skipped: acctSkipped,
            categorized: fresh.filter((r) => r.categoryId).length,
          });
        });
      }
    }

    if (anyImported) dispatchSoon();

    for (const p of ["/transactions", "/accounts", "/activity"]) {
      revalidatePath(p);
    }
    return { ok: true, accountsUpserted: accounts.length, imported, skipped };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Mercury sync failed";
    // Best-effort failure event in its own transaction — never mask the error.
    try {
      await db.$transaction(async (tx) => {
        await emitEvent(tx, "sync.failed", { source: "Mercury", error });
      });
      dispatchSoon();
      revalidatePath("/activity");
    } catch {
      // Swallow: the failure event is best effort.
    }
    return { ok: false, error };
  }
}
