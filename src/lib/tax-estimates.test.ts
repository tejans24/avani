import { describe, expect, it } from "vitest";

import { isoToUtcDate } from "@/lib/dates";
import { estimateTaxes, quartersForYear, type EstimateInput } from "@/lib/tax-estimates";

function input(overrides: Partial<EstimateInput> = {}): EstimateInput {
  return {
    ytdNetProfitCents: 0,
    asOf: isoToUtcDate("2026-07-01"),
    year: 2026,
    federalRateBps: 2000,
    stateRateBps: 500,
    withholdingYtdCents: 0,
    payments: [],
    ...overrides,
  };
}

describe("quartersForYear", () => {
  it("returns the four IRS due dates, Q4 landing on Jan 15 of the next year", () => {
    expect(quartersForYear(2026)).toEqual([
      { year: 2026, quarter: 1, dueDateIso: "2026-04-15" },
      { year: 2026, quarter: 2, dueDateIso: "2026-06-15" },
      { year: 2026, quarter: 3, dueDateIso: "2026-09-15" },
      { year: 2026, quarter: 4, dueDateIso: "2027-01-15" },
    ]);
  });
});

describe("estimateTaxes annualization", () => {
  it("annualizes mid-year profit over elapsed days (Jul 1 = day 182)", () => {
    // 5,000,000 * 365 / 182 = 10,027,472.53 -> rounds to 10,027,473 (~$100k)
    const result = estimateTaxes(
      input({ ytdNetProfitCents: 5_000_000, asOf: isoToUtcDate("2026-07-01") })
    );
    expect(result.annualizedProfitCents).toBe(10_027_473);
  });

  it("does not annualize at year end (Dec 31 = day 365)", () => {
    const result = estimateTaxes(
      input({ ytdNetProfitCents: 10_000_000, asOf: isoToUtcDate("2026-12-31") })
    );
    expect(result.annualizedProfitCents).toBe(10_000_000);
  });
});

describe("estimateTaxes zero and negative profit", () => {
  it("zero profit yields all zeros and no next due", () => {
    const result = estimateTaxes(input({ ytdNetProfitCents: 0 }));
    expect(result.annualizedProfitCents).toBe(0);
    expect(result.estAnnualFederalCents).toBe(0);
    expect(result.estAnnualStateCents).toBe(0);
    expect(result.estAnnualTotalCents).toBe(0);
    for (const q of result.schedule) {
      expect(q.targetCents).toBe(0);
      expect(q.remainingCents).toBe(0);
    }
    expect(result.nextDue).toBeNull();
  });

  it("a loss is passed through un-annualized with all targets zero", () => {
    const result = estimateTaxes(input({ ytdNetProfitCents: -50_000 }));
    expect(result.annualizedProfitCents).toBe(-50_000);
    expect(result.estAnnualTotalCents).toBe(0);
    expect(result.schedule.every((q) => q.targetCents === 0 && q.remainingCents === 0)).toBe(true);
    expect(result.nextDue).toBeNull();
  });
});

describe("estimateTaxes schedule, payments, withholding", () => {
  // $100,000 profit at year end; fed 20% = $20,000; state 5% = $5,000;
  // withholding $6,000 -> total due $19,000; cumulative targets $4,750 per quarter.
  const base = input({
    ytdNetProfitCents: 10_000_000,
    asOf: isoToUtcDate("2026-12-31"),
    withholdingYtdCents: 600_000,
  });

  it("computes gross jurisdiction estimates and withholding-reduced total", () => {
    const result = estimateTaxes(base);
    expect(result.estAnnualFederalCents).toBe(2_000_000);
    expect(result.estAnnualStateCents).toBe(500_000);
    expect(result.estAnnualTotalCents).toBe(1_900_000);
  });

  it("builds cumulative targets and reduces remaining by payments in both jurisdictions", () => {
    const result = estimateTaxes({
      ...base,
      payments: [
        { quarter: 1, jurisdiction: "FEDERAL", amountCents: 300_000 },
        { quarter: 1, jurisdiction: "STATE", amountCents: 100_000 },
      ],
    });
    expect(result.schedule.map((q) => q.targetCents)).toEqual([475_000, 950_000, 1_425_000, 1_900_000]);
    expect(result.schedule.map((q) => q.paidCents)).toEqual([400_000, 0, 0, 0]);
    // remaining = cumulative target - cumulative paid, floored at 0
    expect(result.schedule.map((q) => q.remainingCents)).toEqual([75_000, 550_000, 1_025_000, 1_500_000]);
  });

  it("nextDue is the first quarter due on/after asOf with remaining > 0", () => {
    const result = estimateTaxes({
      ...base,
      payments: [{ quarter: 1, jurisdiction: "FEDERAL", amountCents: 400_000 }],
    });
    // As of Dec 31 only Q4 (due Jan 15 next year) is still upcoming.
    expect(result.nextDue).not.toBeNull();
    expect(result.nextDue!.quarter.quarter).toBe(4);
    expect(result.nextDue!.quarter.dueDateIso).toBe("2027-01-15");
    expect(result.nextDue!.remainingCents).toBe(1_500_000);
  });

  it("nextDue skips past quarters at mid-year", () => {
    const result = estimateTaxes(
      input({ ytdNetProfitCents: 5_000_000, asOf: isoToUtcDate("2026-05-01") })
    );
    // Q1 (Apr 15) is already past; Q2 (Jun 15) is next and unpaid.
    expect(result.nextDue!.quarter.quarter).toBe(2);
    expect(result.nextDue!.remainingCents).toBe(result.schedule[1].remainingCents);
    expect(result.nextDue!.remainingCents).toBeGreaterThan(0);
  });

  it("overpayment floors remaining at zero and clears nextDue", () => {
    const result = estimateTaxes({
      ...base,
      payments: [{ quarter: 1, jurisdiction: "FEDERAL", amountCents: 5_000_000 }],
    });
    expect(result.schedule.every((q) => q.remainingCents === 0)).toBe(true);
    expect(result.nextDue).toBeNull();
  });

  it("large withholding floors the annual total (and every target) at zero", () => {
    const result = estimateTaxes({ ...base, withholdingYtdCents: 99_999_999 });
    expect(result.estAnnualTotalCents).toBe(0);
    expect(result.schedule.every((q) => q.targetCents === 0)).toBe(true);
    expect(result.nextDue).toBeNull();
  });
});
