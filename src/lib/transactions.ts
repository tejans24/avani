/**
 * Transaction ingestion helpers: normalization, sign convention, dedupe keys.
 *
 * Sign convention: `amountCents` is signed from the BUSINESS's perspective —
 * positive means money coming in, negative means money going out.
 * Mercury bank amounts already follow this convention and pass through
 * unchanged. Amex-style card CSVs list charges as positive numbers (and
 * payments/credits as negative), so those must be flipped on import; see
 * {@link normalizeCsvAmount} and the import wizard's "amounts are charges"
 * toggle.
 */

import { createHash } from "node:crypto";

/**
 * Normalize a transaction description for matching/dedupe: trim, collapse
 * internal whitespace to single spaces, uppercase.
 *
 * Also strips a long trailing reference-number run (a final token of 6 or
 * more digits) so re-exports with rotating reference suffixes still dedupe,
 * e.g. "PAYMENT REF 123456789" and "PAYMENT REF 987654321" both normalize to
 * "PAYMENT REF". Kept conservative: only a single all-digit final token is
 * removed, and never when it is the entire description.
 */
export function normalizeDescription(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, " ").toUpperCase();
  // Strip one trailing all-digit token of 6+ digits, but keep at least one token.
  return collapsed.replace(/^(.+) \d{6,}$/, "$1");
}

/** Stable dedupe key for a Mercury bank transaction. */
export function mercuryDedupeKey(mercuryTransactionId: string): string {
  return `mercury:${mercuryTransactionId}`;
}

/**
 * Content-derived dedupe key for a CSV row. `ordinal` is the index of this
 * row among IDENTICAL (date, cents, normalized description) rows within one
 * file — see {@link assignOrdinals} — so two legitimate identical same-day
 * charges both import, while re-importing the same file is a complete no-op.
 */
export function csvDedupeKey(row: {
  dateIso: string;
  amountCents: number;
  description: string;
  ordinal: number;
}): string {
  const payload = `${row.dateIso}|${row.amountCents}|${normalizeDescription(
    row.description
  )}|${row.ordinal}`;
  const hash = createHash("sha256").update(payload).digest("hex");
  return `csv:${hash}`;
}

/**
 * Assign ordinals to CSV rows: each row's ordinal is the number of earlier
 * rows in the file with the same (dateIso, amountCents, normalized
 * description) identity triple. Stable — input order is preserved and the
 * input array is not mutated.
 */
export function assignOrdinals(
  rows: { dateIso: string; amountCents: number; description: string }[]
): { dateIso: string; amountCents: number; description: string; ordinal: number }[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const identity = `${row.dateIso}|${row.amountCents}|${normalizeDescription(row.description)}`;
    const ordinal = seen.get(identity) ?? 0;
    seen.set(identity, ordinal + 1);
    return { ...row, ordinal };
  });
}

/**
 * Convert a CSV amount to the business-perspective sign convention.
 * When `amountsAreCharges` (Amex-style: charges positive, payments negative),
 * the sign is flipped: a 4200 charge becomes -4200 (money out) and a -5000
 * payment becomes +5000 (money in). Otherwise the amount passes through.
 */
export function normalizeCsvAmount(csvCents: number, amountsAreCharges: boolean): number {
  if (!amountsAreCharges) return csvCents;
  // Avoid producing -0 for zero amounts.
  return csvCents === 0 ? 0 : -csvCents;
}
