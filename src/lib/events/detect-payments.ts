/**
 * Payment-related detectors (owned by the matching milestone).
 * Wired into runDetectors in detectors.ts.
 */

/** SENT invoices past due+3 days with no matched deposit and no prior event. */
export async function detectMissingPayments(_now: Date): Promise<number> {
  return 0; // implemented by the matching track
}
