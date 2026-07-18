/**
 * Quarterly estimated-tax math for an S-corp owner.
 *
 * Framing: the owner's salary is W-2 wages with payroll withholding; the K-1
 * pass-through profit has no withholding, so the owner makes personal
 * quarterly estimated payments on it. The federal/state rates here are
 * owner-supplied EFFECTIVE rates (basis points), not bracket math. Every
 * consumer of these numbers must display "Estimate only — not tax advice."
 *
 * The math is deliberately simple and documented inline:
 * - Annualize: profit * 365 / elapsed days of the year at `asOf`.
 * - Annual tax due = annualized profit x (federal + state effective rates),
 *   minus YTD withholding, floored at 0.
 * - Quarterly targets are cumulative: by quarter q the owner should have paid
 *   totalDue * q / 4 (rounded). Remaining per quarter is the cumulative
 *   target minus cumulative payments so far, floored at 0.
 */

import { dateToIso } from "@/lib/dates";

export type Quarter = { year: number; quarter: 1 | 2 | 3 | 4; dueDateIso: string };

/**
 * IRS estimated-payment due dates for a tax year:
 * Q1 Apr 15, Q2 Jun 15, Q3 Sep 15, Q4 Jan 15 of the following year.
 */
export function quartersForYear(year: number): Quarter[] {
  return [
    { year, quarter: 1, dueDateIso: `${year}-04-15` },
    { year, quarter: 2, dueDateIso: `${year}-06-15` },
    { year, quarter: 3, dueDateIso: `${year}-09-15` },
    { year, quarter: 4, dueDateIso: `${year + 1}-01-15` },
  ];
}

export type EstimateInput = {
  ytdNetProfitCents: number;
  asOf: Date;
  year: number;
  federalRateBps: number;
  stateRateBps: number;
  withholdingYtdCents: number;
  payments: {
    quarter: 1 | 2 | 3 | 4;
    jurisdiction: "FEDERAL" | "STATE";
    amountCents: number;
  }[];
};

export type EstimateResult = {
  annualizedProfitCents: number;
  /** Gross annual estimates per jurisdiction (before withholding). */
  estAnnualFederalCents: number;
  estAnnualStateCents: number;
  /** Combined federal + state, minus YTD withholding, floored at 0. */
  estAnnualTotalCents: number;
  /**
   * Combined fed+state schedule. targetCents is CUMULATIVE:
   * totalDue * quarterIndex / 4, rounded. remainingCents is the cumulative
   * target minus cumulative payments through that quarter, floored at 0.
   */
  schedule: { quarter: Quarter; targetCents: number; paidCents: number; remainingCents: number }[];
  /** First quarter with dueDate >= asOf (date-only) and remaining > 0. */
  nextDue: { quarter: Quarter; remainingCents: number } | null;
};

/** Whole days elapsed in `year` as of `d`, counting the `asOf` day itself (Jan 1 = 1). */
function elapsedDaysOfYear(d: Date, year: number): number {
  const jan1 = Date.UTC(year, 0, 1);
  const mid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((mid - jan1) / 86_400_000) + 1;
}

export function estimateTaxes(input: EstimateInput): EstimateResult {
  const quarters = quartersForYear(input.year);
  const asOfIso = dateToIso(input.asOf);

  // Annualize YTD profit over the elapsed portion of the year. Non-positive
  // profit is not annualized (no tax due; a loss stays a loss).
  const elapsed = Math.max(1, elapsedDaysOfYear(input.asOf, input.year));
  const annualizedProfitCents =
    input.ytdNetProfitCents <= 0
      ? Math.min(input.ytdNetProfitCents, 0)
      : Math.round((input.ytdNetProfitCents * 365) / elapsed);

  const taxable = Math.max(0, annualizedProfitCents);
  const estAnnualFederalCents = Math.round((taxable * input.federalRateBps) / 10_000);
  const estAnnualStateCents = Math.round((taxable * input.stateRateBps) / 10_000);
  const estAnnualTotalCents = Math.max(
    0,
    estAnnualFederalCents + estAnnualStateCents - input.withholdingYtdCents
  );

  // Per-quarter payments across both jurisdictions.
  const paidByQuarter = [0, 0, 0, 0];
  for (const p of input.payments) {
    paidByQuarter[p.quarter - 1] += p.amountCents;
  }

  let cumulativePaid = 0;
  const schedule = quarters.map((quarter, i) => {
    cumulativePaid += paidByQuarter[i];
    const targetCents = Math.round((estAnnualTotalCents * (i + 1)) / 4);
    return {
      quarter,
      targetCents,
      paidCents: paidByQuarter[i],
      remainingCents: Math.max(0, targetCents - cumulativePaid),
    };
  });

  const nextEntry =
    schedule.find((s) => s.quarter.dueDateIso >= asOfIso && s.remainingCents > 0) ?? null;

  return {
    annualizedProfitCents,
    estAnnualFederalCents,
    estAnnualStateCents,
    estAnnualTotalCents,
    schedule,
    nextDue: nextEntry
      ? { quarter: nextEntry.quarter, remainingCents: nextEntry.remainingCents }
      : null,
  };
}
