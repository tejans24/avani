import { describe, expect, it } from "vitest";

import { isoToUtcDate } from "@/lib/dates";
import {
  aggregatePnl,
  deductibleNetProfitCents,
  type CategoryLike,
  type TxnForPnl,
} from "@/lib/pnl";

const categories: CategoryLike[] = [
  { id: "sales", name: "Sales", kind: "INCOME", taxLine: "GROSS_RECEIPTS", deductiblePct: 100, sortOrder: 1 },
  { id: "unused", name: "Unused", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS", deductiblePct: 100, sortOrder: 5 },
  { id: "software", name: "Software", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS", deductiblePct: 100, sortOrder: 10 },
  { id: "meals", name: "Meals", kind: "EXPENSE", taxLine: "OTHER_DEDUCTIONS", deductiblePct: 50, sortOrder: 20 },
  { id: "xfer", name: "Transfers", kind: "TRANSFER", taxLine: "NONE", deductiblePct: 100, sortOrder: 30 },
  { id: "owner", name: "Owner draws", kind: "OWNER", taxLine: "NONE", deductiblePct: 100, sortOrder: 40 },
];

function txn(iso: string, amountCents: number, categoryId: string | null, status = "REVIEWED"): TxnForPnl {
  return { postedAt: isoToUtcDate(iso), amountCents, categoryId, status };
}

// Fixture year 2026, hand-computed in dollars:
//   Income:   $5,000.00 (Jan) + $2,500.00 (Mar)         = $7,500.00
//   Expenses: -$200.00 software (Feb), -$100.00 meals (Jul)
//   Net profit = 7,500 - 300 = $7,200.00
//   Below line: transfers -$300/+$300 (net 0), owner -$400 (Jun)
//   Uncategorized: -$50 (Aug). Excluded: -$999.99 software (Apr, omitted).
const txns: TxnForPnl[] = [
  txn("2026-01-05", 500_000, "sales"),
  txn("2026-03-10", 250_000, "sales", "UNREVIEWED"),
  txn("2026-02-02", -20_000, "software"),
  txn("2026-07-04", -10_000, "meals"),
  txn("2026-04-01", -99_999, "software", "EXCLUDED"),
  txn("2026-05-03", -30_000, "xfer"),
  txn("2026-05-04", 30_000, "xfer"),
  txn("2026-06-06", -40_000, "owner"),
  txn("2026-08-08", -5_000, null),
  txn("2025-12-31", 777_777, "sales"), // wrong year, ignored
];

function cell(row: { cells: { periodKey: string; cents: number }[] }, key: string): number {
  const found = row.cells.find((c) => c.periodKey === key);
  if (!found) throw new Error(`no cell for ${key}`);
  return found.cents;
}

describe("aggregatePnl MONTH", () => {
  const pnl = aggregatePnl(txns, categories, { year: 2026, granularity: "MONTH" });

  it("builds 12 monthly periods with correct keys, labels and bounds", () => {
    expect(pnl.periods).toHaveLength(12);
    expect(pnl.periods[0]).toEqual({ key: "2026-01", label: "Jan", startIso: "2026-01-01", endIso: "2026-01-31" });
    expect(pnl.periods[1]).toEqual({ key: "2026-02", label: "Feb", startIso: "2026-02-01", endIso: "2026-02-28" });
    expect(pnl.periods[11]).toEqual({ key: "2026-12", label: "Dec", startIso: "2026-12-01", endIso: "2026-12-31" });
  });

  it("buckets income by posted month and counts UNREVIEWED + REVIEWED", () => {
    expect(pnl.income).toHaveLength(1);
    const sales = pnl.income[0];
    expect(sales.name).toBe("Sales");
    expect(cell(sales, "2026-01")).toBe(500_000);
    expect(cell(sales, "2026-03")).toBe(250_000);
    expect(cell(sales, "2026-02")).toBe(0);
    expect(sales.totalCents).toBe(750_000);
  });

  it("keeps expense rows negative, sorted by sortOrder, and omits zero-activity and EXCLUDED", () => {
    expect(pnl.expenses.map((r) => r.categoryId)).toEqual(["software", "meals"]);
    expect(pnl.expenses[0].totalCents).toBe(-20_000); // EXCLUDED -99999 omitted
    expect(cell(pnl.expenses[0], "2026-02")).toBe(-20_000);
    expect(pnl.expenses[1].totalCents).toBe(-10_000);
    expect(cell(pnl.expenses[1], "2026-07")).toBe(-10_000);
  });

  it("puts TRANSFER and OWNER below the line; transfers net to zero", () => {
    expect(pnl.belowLine.map((r) => r.categoryId)).toEqual(["xfer", "owner"]);
    const [xfer, owner] = pnl.belowLine;
    expect(xfer.totalCents).toBe(0);
    expect(cell(xfer, "2026-05")).toBe(0); // -30000 + 30000 in the same month
    expect(owner.totalCents).toBe(-40_000);
  });

  it("collects uncategorized transactions in their own row", () => {
    expect(pnl.uncategorized).not.toBeNull();
    expect(pnl.uncategorized!.name).toBe("Uncategorized");
    expect(pnl.uncategorized!.categoryId).toBeNull();
    expect(pnl.uncategorized!.totalCents).toBe(-5_000);
    expect(cell(pnl.uncategorized!, "2026-08")).toBe(-5_000);
  });

  it("computes net profit as income + expenses only ($7,200.00)", () => {
    expect(pnl.netProfitCents).toBe(720_000);
    const byKey = Object.fromEntries(pnl.netProfitCells.map((c) => [c.periodKey, c.cents]));
    expect(byKey["2026-01"]).toBe(500_000);
    expect(byKey["2026-02"]).toBe(-20_000);
    expect(byKey["2026-03"]).toBe(250_000);
    expect(byKey["2026-05"]).toBe(0); // transfers excluded
    expect(byKey["2026-06"]).toBe(0); // owner excluded
    expect(byKey["2026-07"]).toBe(-10_000);
    expect(byKey["2026-08"]).toBe(0); // uncategorized excluded
  });
});

describe("aggregatePnl QUARTER", () => {
  const pnl = aggregatePnl(txns, categories, { year: 2026, granularity: "QUARTER" });

  it("builds four quarters with correct bounds", () => {
    expect(pnl.periods.map((p) => p.key)).toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
    expect(pnl.periods[0]).toMatchObject({ startIso: "2026-01-01", endIso: "2026-03-31" });
    expect(pnl.periods[3]).toMatchObject({ startIso: "2026-10-01", endIso: "2026-12-31" });
  });

  it("buckets by quarter", () => {
    expect(cell(pnl.income[0], "2026-Q1")).toBe(750_000);
    const byKey = Object.fromEntries(pnl.netProfitCells.map((c) => [c.periodKey, c.cents]));
    expect(byKey["2026-Q1"]).toBe(730_000); // 500000 - 20000 + 250000
    expect(byKey["2026-Q2"]).toBe(0);
    expect(byKey["2026-Q3"]).toBe(-10_000);
    expect(byKey["2026-Q4"]).toBe(0);
    expect(pnl.netProfitCents).toBe(720_000);
  });
});

describe("aggregatePnl YTD", () => {
  const pnl = aggregatePnl(txns, categories, { year: 2026, granularity: "YTD" });

  it("uses a single full-year period", () => {
    expect(pnl.periods).toEqual([
      { key: "2026", label: "2026", startIso: "2026-01-01", endIso: "2026-12-31" },
    ]);
    expect(cell(pnl.income[0], "2026")).toBe(750_000);
    expect(pnl.netProfitCells).toEqual([{ periodKey: "2026", cents: 720_000 }]);
    expect(pnl.netProfitCents).toBe(720_000);
  });

  it("returns null uncategorized when every transaction is categorized", () => {
    const categorizedOnly = txns.filter((t) => t.categoryId !== null);
    const result = aggregatePnl(categorizedOnly, categories, { year: 2026, granularity: "YTD" });
    expect(result.uncategorized).toBeNull();
  });
});

describe("deductibleNetProfitCents", () => {
  it("scales meals by 50% and ignores transfers, owner, uncategorized, EXCLUDED", () => {
    // 750000 income - 20000 software - 5000 (50% of -10000 meals) = 725000
    expect(deductibleNetProfitCents(txns, categories, { year: 2026 })).toBe(725_000);
  });

  it("the meals category contributes half of its stored amount", () => {
    const mealsOnly = [txn("2026-07-04", -10_000, "meals")];
    expect(deductibleNetProfitCents(mealsOnly, categories, { year: 2026 })).toBe(-5_000);
  });

  it("respects upTo as an inclusive date cutoff", () => {
    // Through Jun 30: income 750000 - software 20000 (meals is Jul 4, excluded)
    expect(
      deductibleNetProfitCents(txns, categories, { year: 2026, upTo: isoToUtcDate("2026-06-30") })
    ).toBe(730_000);
    // Through Jul 4 inclusive: meals now counts at 50%
    expect(
      deductibleNetProfitCents(txns, categories, { year: 2026, upTo: isoToUtcDate("2026-07-04") })
    ).toBe(725_000);
  });
});
