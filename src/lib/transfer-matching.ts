/**
 * Pure account-to-account transfer matching. A transfer (e.g. paying a credit
 * card from a bank account) shows up as two transactions: an outflow on one
 * account and an equal-and-opposite inflow on another. Neither is income or an
 * expense — booking them as transfers keeps the underlying card charges from
 * being double-counted in P&L / taxes.
 *
 * No database access — callers load candidates and pass them in.
 */

import { dateToIso } from "@/lib/dates";

/** Default window: the two legs usually clear within a few days of each other. */
export const TRANSFER_WINDOW_DAYS = 5;

export type TransferTxnLike = {
  id: string;
  accountId: string;
  accountName: string;
  postedAt: Date;
  amountCents: number;
  description: string;
};

export type TransferCandidate = {
  transactionId: string;
  accountName: string;
  amountCents: number;
  reason: string;
};

function absDaysBetween(a: Date, b: Date): number {
  const aMid = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bMid = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.abs(Math.round((aMid - bMid) / 86_400_000));
}

/**
 * Find the opposite legs a transaction could be transferring with.
 *
 * A candidate must:
 * - be on a DIFFERENT account (a transfer moves money between accounts),
 * - have the exact equal-and-opposite amount (`candidate.amountCents === -txn.amountCents`),
 * - and have posted within `windowDays` of the transaction.
 *
 * Results are sorted by date proximity (closest first). A zero-amount
 * transaction never matches.
 */
export function findTransferMatches(
  txn: { id: string; accountId: string; postedAt: Date; amountCents: number },
  candidates: TransferTxnLike[],
  windowDays: number = TRANSFER_WINDOW_DAYS
): TransferCandidate[] {
  if (txn.amountCents === 0) return [];

  return candidates
    .filter(
      (c) =>
        c.id !== txn.id &&
        c.accountId !== txn.accountId &&
        c.amountCents === -txn.amountCents &&
        absDaysBetween(c.postedAt, txn.postedAt) <= windowDays
    )
    .sort((a, b) => absDaysBetween(a.postedAt, txn.postedAt) - absDaysBetween(b.postedAt, txn.postedAt))
    .map((c) => ({
      transactionId: c.id,
      accountName: c.accountName,
      amountCents: c.amountCents,
      reason: `matches an opposite ${dateToIso(c.postedAt)} entry on ${c.accountName}`,
    }));
}
