import { describe, expect, it } from "vitest";

import {
  computeInvoiceTotals,
  computeLineAmountCents,
  dollarsToCents,
  formatBps,
  formatCents,
} from "@/lib/money";

describe("formatCents", () => {
  it("formats whole and fractional amounts with thousands separators", () => {
    expect(formatCents(594000)).toBe("$5,940.00");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
    expect(formatCents(9000)).toBe("$90.00");
    expect(formatCents(9050)).toBe("$90.50");
    expect(formatCents(1)).toBe("$0.01");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("$0.00");
  });

  it("formats negatives with a leading minus sign", () => {
    expect(formatCents(-1234)).toBe("-$12.34");
    expect(formatCents(-100)).toBe("-$1.00");
  });
});

describe("dollarsToCents", () => {
  it("parses plain integers and decimals", () => {
    expect(dollarsToCents("90")).toBe(9000);
    expect(dollarsToCents("90.5")).toBe(9050);
    expect(dollarsToCents("90.50")).toBe(9050);
    expect(dollarsToCents("0")).toBe(0);
    expect(dollarsToCents("0.01")).toBe(1);
  });

  it("parses dollar signs and comma separators", () => {
    expect(dollarsToCents("$1,234.56")).toBe(123456);
    expect(dollarsToCents("$90")).toBe(9000);
    expect(dollarsToCents("1,000,000")).toBe(100000000);
    expect(dollarsToCents("  $ 12.34  ")).toBe(1234);
  });

  it("accepts numeric input", () => {
    expect(dollarsToCents(90)).toBe(9000);
    expect(dollarsToCents(90.5)).toBe(9050);
    expect(dollarsToCents(0)).toBe(0);
  });

  it("rounds half away from zero beyond 2 decimal places", () => {
    expect(dollarsToCents("1.005")).toBe(101);
    expect(dollarsToCents("1.004")).toBe(100);
    expect(dollarsToCents("1.0049")).toBe(100);
    expect(dollarsToCents("2.675")).toBe(268);
    expect(dollarsToCents(1.005)).toBe(101);
  });

  it("returns null on invalid input", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("   ")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("12.3.4")).toBeNull();
    expect(dollarsToCents("$")).toBeNull();
    expect(dollarsToCents("1,23.45")).toBeNull();
    expect(dollarsToCents("12abc")).toBeNull();
    expect(dollarsToCents(NaN)).toBeNull();
    expect(dollarsToCents(Infinity)).toBeNull();
  });

  it("returns null on negatives and negative-garbage", () => {
    expect(dollarsToCents("-90")).toBeNull();
    expect(dollarsToCents("$-90")).toBeNull();
    expect(dollarsToCents("--5")).toBeNull();
    expect(dollarsToCents(-90)).toBeNull();
  });
});

describe("computeLineAmountCents", () => {
  it("multiplies hours by unit price in cents", () => {
    expect(computeLineAmountCents(6, 9000)).toBe(54000);
    expect(computeLineAmountCents(20, 9000)).toBe(180000);
  });

  it("handles fractional hours exactly", () => {
    expect(computeLineAmountCents(37.5, 9000)).toBe(337500);
    expect(computeLineAmountCents(0.25, 9000)).toBe(2250);
    expect(computeLineAmountCents(1.33, 9999)).toBe(13299);
  });
});

describe("computeInvoiceTotals", () => {
  it("computes the Mercury sample at 0 bps", () => {
    const items = [6, 20, 20, 20].map((quantity) => ({ quantity, unitPriceCents: 9000 }));
    const totals = computeInvoiceTotals(items, 0);
    expect(totals.lineAmountsCents).toEqual([54000, 180000, 180000, 180000]);
    expect(totals.subtotalCents).toBe(594000);
    expect(totals.taxCents).toBe(0);
    expect(totals.totalCents).toBe(594000);
  });

  it("applies 8.75% tax with correct rounding on odd subtotals", () => {
    // subtotal 10001 * 875 / 10000 = 875.0875 -> 875
    const t1 = computeInvoiceTotals([{ quantity: 1, unitPriceCents: 10001 }], 875);
    expect(t1.subtotalCents).toBe(10001);
    expect(t1.taxCents).toBe(875);
    expect(t1.totalCents).toBe(10876);

    // subtotal 9999 * 875 / 10000 = 874.9125 -> 875
    const t2 = computeInvoiceTotals([{ quantity: 1, unitPriceCents: 9999 }], 875);
    expect(t2.taxCents).toBe(875);
    expect(t2.totalCents).toBe(10874);

    // subtotal 6 * 875 / 10000 = 0.525 -> 1 (half rounds up)
    const t3 = computeInvoiceTotals([{ quantity: 1, unitPriceCents: 6 }], 875);
    expect(t3.taxCents).toBe(1);
    expect(t3.totalCents).toBe(7);
  });

  it("handles fractional hours in totals", () => {
    const totals = computeInvoiceTotals([{ quantity: 37.5, unitPriceCents: 9000 }], 875);
    expect(totals.subtotalCents).toBe(337500);
    // 337500 * 875 / 10000 = 29531.25 -> 29531
    expect(totals.taxCents).toBe(29531);
    expect(totals.totalCents).toBe(367031);
  });

  it("handles an empty item list", () => {
    const totals = computeInvoiceTotals([], 875);
    expect(totals).toEqual({
      lineAmountsCents: [],
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });
});

describe("formatBps", () => {
  it("trims trailing zeros", () => {
    expect(formatBps(875)).toBe("8.75%");
    expect(formatBps(1000)).toBe("10%");
    expect(formatBps(0)).toBe("0%");
    expect(formatBps(850)).toBe("8.5%");
    expect(formatBps(10000)).toBe("100%");
    expect(formatBps(1)).toBe("0.01%");
    expect(formatBps(10)).toBe("0.1%");
  });
});
