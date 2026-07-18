import { db } from "@/lib/db";
import { dateToIso } from "@/lib/dates";
import { findInvoiceMatches, type MatchCandidate, type SentInvoiceLike } from "@/lib/matching";

/**
 * Server-side helpers that load candidates from the database and run the pure
 * matching heuristic (src/lib/matching.ts) over them. Pages call these to
 * compute deposit→invoice suggestions; confirmation lives in actions/match.ts.
 */

export type SuggestionForTxn = { transactionId: string; candidates: MatchCandidate[] };

/**
 * A deposit is match-eligible when it's money in, not already matched, not
 * excluded, and either uncategorized or categorized as income (a deposit
 * already booked as e.g. an owner contribution shouldn't be suggested).
 */
function eligibleDepositWhere() {
  return {
    amountCents: { gt: 0 },
    matchedInvoiceId: null,
    status: { not: "EXCLUDED" as const },
    OR: [{ categoryId: null }, { category: { kind: "INCOME" as const } }],
  };
}

/**
 * Suggestions per transaction: for each unmatched eligible deposit (optionally
 * restricted to `txnIds`, e.g. the current page), run findInvoiceMatches
 * against all SENT invoices. Only transactions with at least one candidate
 * appear in the returned map.
 */
export async function suggestionsForTransactions(
  txnIds?: string[]
): Promise<Map<string, MatchCandidate[]>> {
  const result = new Map<string, MatchCandidate[]>();
  if (txnIds && txnIds.length === 0) return result;

  const txns = await db.transaction.findMany({
    where: {
      ...eligibleDepositWhere(),
      ...(txnIds ? { id: { in: txnIds } } : {}),
    },
    select: { id: true, amountCents: true, postedAt: true, description: true },
  });
  if (txns.length === 0) return result;

  const sent = await db.invoice.findMany({
    where: { status: "SENT" },
    include: { client: { select: { name: true } } },
  });
  if (sent.length === 0) return result;

  const invoices: SentInvoiceLike[] = sent.map((inv) => ({
    id: inv.id,
    number: inv.number,
    clientName: inv.client.name,
    totalCents: inv.totalCents,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
  }));

  for (const txn of txns) {
    const candidates = findInvoiceMatches(txn, invoices);
    if (candidates.length > 0) result.set(txn.id, candidates);
  }
  return result;
}

/**
 * Reverse lookup for the invoice detail page: for a SENT invoice, find the
 * earliest unmatched eligible deposit whose amount equals the invoice total
 * and that posted on/after the issue date.
 */
export async function suggestionForInvoice(invoiceId: string): Promise<{
  transactionId: string;
  postedAtIso: string;
  amountCents: number;
  description: string;
} | null> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.status !== "SENT" || invoice.totalCents <= 0) return null;

  const txn = await db.transaction.findFirst({
    where: {
      ...eligibleDepositWhere(),
      amountCents: invoice.totalCents,
      postedAt: { gte: invoice.issueDate },
    },
    orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }],
  });
  if (!txn) return null;

  return {
    transactionId: txn.id,
    postedAtIso: dateToIso(txn.postedAt),
    amountCents: txn.amountCents,
    description: txn.description,
  };
}
