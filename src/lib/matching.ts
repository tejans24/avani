/**
 * Pure invoice-matching logic: given a bank deposit and the list of sent
 * (unpaid) invoices, suggest which invoice the deposit likely pays.
 *
 * No database access — callers load candidates and pass them in.
 */

import { dateToIso } from "@/lib/dates";

export type MatchConfidence = "HIGH" | "MEDIUM";

export type SentInvoiceLike = {
  id: string;
  number: string;
  clientName: string;
  totalCents: number;
  issueDate: Date;
  dueDate: Date;
};

export type MatchCandidate = {
  invoiceId: string;
  number: string;
  clientName: string;
  confidence: MatchConfidence;
  reason: string;
};

// Matches both legacy global numbers (INV-0001) and client-prefixed ones
// (INV-ACME-0007) when clients paste the number into an ACH/wire memo.
const INVOICE_NUMBER_RE = /INV-(?:[A-Z0-9]{2,6}-)?\d+/gi;

/** Absolute distance in whole UTC days between two date-only values. */
function absDaysBetween(a: Date, b: Date): number {
  const aMid = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bMid = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.abs(Math.round((aMid - bMid) / 86_400_000));
}

/**
 * Find invoices that a bank transaction could be paying.
 *
 * Rules:
 * - Only deposits (amountCents > 0) can match; anything else returns [].
 * - A candidate must have totalCents === amountCents and have been issued on
 *   or before the transaction's posted date (date-only, UTC comparison).
 * - If the description contains an invoice number (INV-\d+, case-insensitive)
 *   equal to a candidate's number, that candidate is returned first with HIGH
 *   confidence ("invoice number in description").
 * - Otherwise a lone candidate is HIGH ("exact amount match"); multiple
 *   candidates are all MEDIUM, sorted by |dueDate - postedAt| ascending
 *   ("amount matches N invoices").
 */
export function findInvoiceMatches(
  txn: { amountCents: number; postedAt: Date; description: string },
  sentInvoices: SentInvoiceLike[]
): MatchCandidate[] {
  if (txn.amountCents <= 0) return [];

  const postedIso = dateToIso(txn.postedAt);
  const candidates = sentInvoices.filter(
    (inv) => inv.totalCents === txn.amountCents && dateToIso(inv.issueDate) <= postedIso
  );
  if (candidates.length === 0) return [];

  // Invoice numbers mentioned in the bank description, normalized to upper case.
  const mentioned = new Set(
    (txn.description.match(INVOICE_NUMBER_RE) ?? []).map((n) => n.toUpperCase())
  );
  const numberMatch = candidates.find((inv) => mentioned.has(inv.number.toUpperCase()));

  const rest = candidates
    .filter((inv) => inv !== numberMatch)
    .sort(
      (a, b) => absDaysBetween(a.dueDate, txn.postedAt) - absDaysBetween(b.dueDate, txn.postedAt)
    );

  const results: MatchCandidate[] = [];
  if (numberMatch) {
    results.push({
      invoiceId: numberMatch.id,
      number: numberMatch.number,
      clientName: numberMatch.clientName,
      confidence: "HIGH",
      reason: "invoice number in description",
    });
  }

  for (const inv of rest) {
    const single = !numberMatch && candidates.length === 1;
    results.push({
      invoiceId: inv.id,
      number: inv.number,
      clientName: inv.clientName,
      confidence: single ? "HIGH" : "MEDIUM",
      reason: single ? "exact amount match" : `amount matches ${candidates.length} invoices`,
    });
  }

  return results;
}
