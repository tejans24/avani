import { db } from "@/lib/db";
import { dateToIso } from "@/lib/dates";
import { findTransferMatches, type TransferTxnLike } from "@/lib/transfer-matching";

/**
 * Server-side helper: load transfer-eligible transactions and run the pure
 * matcher (transfer-matching.ts) to suggest account-to-account transfer pairs.
 * Confirmation lives in actions/transfer.ts.
 *
 * A leg is eligible when it's uncategorized, not already paired, not matched to
 * an invoice, and not excluded — i.e. an unexplained money movement that could
 * be the other side of a transfer.
 */

export type TransferLeg = {
  transactionId: string;
  accountName: string;
  amountCents: number;
  postedAtIso: string;
  description: string;
};

export type TransferPair = { a: TransferLeg; b: TransferLeg };

function eligibleWhere() {
  return {
    status: { not: "EXCLUDED" as const },
    matchedInvoiceId: null,
    transferGroupId: null,
    categoryId: null,
  };
}

/**
 * Distinct suggested transfer pairs. Each unordered pair appears once; the leg
 * with the outflow (negative amount) is `a` for stable display.
 */
export async function transferSuggestions(): Promise<TransferPair[]> {
  const txns = await db.transaction.findMany({
    where: eligibleWhere(),
    select: {
      id: true,
      accountId: true,
      postedAt: true,
      amountCents: true,
      description: true,
      account: { select: { name: true } },
    },
  });
  if (txns.length < 2) return [];

  const candidates: TransferTxnLike[] = txns.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    accountName: t.account.name,
    postedAt: t.postedAt,
    amountCents: t.amountCents,
    description: t.description,
  }));
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const seen = new Set<string>();
  const pairs: TransferPair[] = [];
  for (const t of candidates) {
    const [match] = findTransferMatches(t, candidates);
    if (!match) continue;
    const key = [t.id, match.transactionId].sort().join(":");
    if (seen.has(key)) continue;
    seen.add(key);

    const other = byId.get(match.transactionId)!;
    // Outflow (negative) leg first for stable display.
    const [outLeg, inLeg] = t.amountCents < 0 ? [t, other] : [other, t];
    const toLeg = (c: TransferTxnLike): TransferLeg => ({
      transactionId: c.id,
      accountName: c.accountName,
      amountCents: c.amountCents,
      postedAtIso: dateToIso(c.postedAt),
      description: c.description,
    });
    pairs.push({ a: toLeg(outLeg), b: toLeg(inLeg) });
  }
  return pairs;
}

/** Count of suggested transfer pairs (for the dashboard "Needs you" list). */
export async function transferSuggestionCount(): Promise<number> {
  return (await transferSuggestions()).length;
}
