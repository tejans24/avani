/**
 * Tax/compliance/auto-draft detectors (owned by the taxes milestone).
 * Wired into runDetectors in detectors.ts.
 */

/** Quarterly estimate windows opening (due within lead days, remaining > 0). */
export async function detectQuarterWindows(_now: Date): Promise<number> {
  return 0; // implemented by the taxes track
}

/** Compliance deadlines whose lead window opened. */
export async function detectComplianceWindows(_now: Date): Promise<number> {
  return 0; // implemented by the taxes track
}

/** Clients with a billing cadence whose next draft is due. */
export async function detectDueDrafts(_now: Date): Promise<number> {
  return 0; // implemented by the taxes track
}
