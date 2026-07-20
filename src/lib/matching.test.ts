import { describe, expect, it } from "vitest";

import { isoToUtcDate } from "@/lib/dates";
import { findInvoiceMatches, type SentInvoiceLike } from "@/lib/matching";

function invoice(overrides: Partial<SentInvoiceLike> & { id: string }): SentInvoiceLike {
  return {
    number: `INV-${overrides.id}`,
    clientName: "Acme Co",
    totalCents: 100_000,
    issueDate: isoToUtcDate("2026-06-01"),
    dueDate: isoToUtcDate("2026-07-01"),
    ...overrides,
  };
}

describe("findInvoiceMatches", () => {
  it("returns [] for withdrawals and zero amounts", () => {
    const invoices = [invoice({ id: "1", totalCents: 100_000 })];
    const txn = {
      amountCents: -100_000,
      postedAt: isoToUtcDate("2026-06-15"),
      description: "ACH ACME",
    };
    expect(findInvoiceMatches(txn, invoices)).toEqual([]);
    expect(findInvoiceMatches({ ...txn, amountCents: 0 }, invoices)).toEqual([]);
  });

  it("returns a single exact match as HIGH", () => {
    const invoices = [
      invoice({ id: "1", number: "INV-0001", totalCents: 594_000 }),
      invoice({ id: "2", number: "INV-0002", totalCents: 100_000 }),
    ];
    const result = findInvoiceMatches(
      { amountCents: 594_000, postedAt: isoToUtcDate("2026-06-15"), description: "ACH ACME" },
      invoices
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      invoiceId: "1",
      number: "INV-0001",
      clientName: "Acme Co",
      confidence: "HIGH",
      reason: "exact amount match",
    });
  });

  it("returns multiple matches as MEDIUM sorted by due date closest to posted date", () => {
    const invoices = [
      invoice({ id: "far", number: "INV-0001", dueDate: isoToUtcDate("2026-08-30") }),
      invoice({ id: "near", number: "INV-0002", dueDate: isoToUtcDate("2026-06-20") }),
      invoice({ id: "mid", number: "INV-0003", dueDate: isoToUtcDate("2026-07-10") }),
    ];
    const result = findInvoiceMatches(
      { amountCents: 100_000, postedAt: isoToUtcDate("2026-06-15"), description: "WIRE IN" },
      invoices
    );
    expect(result.map((r) => r.invoiceId)).toEqual(["near", "mid", "far"]);
    for (const r of result) {
      expect(r.confidence).toBe("MEDIUM");
      expect(r.reason).toBe("amount matches 3 invoices");
    }
  });

  it("promotes the invoice whose number appears in the description (case-insensitive)", () => {
    const invoices = [
      invoice({ id: "near", number: "INV-0002", dueDate: isoToUtcDate("2026-06-16") }),
      invoice({ id: "named", number: "INV-0007", dueDate: isoToUtcDate("2026-12-31") }),
    ];
    const result = findInvoiceMatches(
      {
        amountCents: 100_000,
        postedAt: isoToUtcDate("2026-06-15"),
        description: "ACH ACME inv-0007 PAYMENT",
      },
      invoices
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      invoiceId: "named",
      confidence: "HIGH",
      reason: "invoice number in description",
    });
    expect(result[1]).toMatchObject({ invoiceId: "near", confidence: "MEDIUM" });
  });

  it("promotes client-prefixed numbers (INV-ACME-0007) in descriptions", () => {
    const invoices = [
      invoice({ id: "near", number: "INV-GLOB-0002", dueDate: isoToUtcDate("2026-06-16") }),
      invoice({ id: "named", number: "INV-ACME-0007", dueDate: isoToUtcDate("2026-12-31") }),
    ];
    const result = findInvoiceMatches(
      {
        amountCents: 100_000,
        postedAt: isoToUtcDate("2026-06-15"),
        description: "ACH TRANSFER memo inv-acme-0007",
      },
      invoices
    );
    expect(result[0]).toMatchObject({
      invoiceId: "named",
      confidence: "HIGH",
      reason: "invoice number in description",
    });
  });

  it("excludes invoices issued after the transaction posted (date compare)", () => {
    const invoices = [
      invoice({ id: "later", issueDate: isoToUtcDate("2026-06-16") }),
      invoice({ id: "same-day", issueDate: isoToUtcDate("2026-06-15") }),
    ];
    const result = findInvoiceMatches(
      { amountCents: 100_000, postedAt: isoToUtcDate("2026-06-15"), description: "DEPOSIT" },
      invoices
    );
    expect(result.map((r) => r.invoiceId)).toEqual(["same-day"]);
    expect(result[0].confidence).toBe("HIGH");
  });

  it("two same-client, same-amount invoices are BOTH medium — never a silent auto-pick", () => {
    // The ambiguity guarantee: when a deposit could pay either of two identical
    // invoices, nothing is HIGH, so the UI must ask the user which one. This
    // prevents auto-marking the wrong invoice paid.
    const invoices = [
      invoice({ id: "a", number: "INV-ACME-0001", clientName: "Acme", totalCents: 250_000 }),
      invoice({ id: "b", number: "INV-ACME-0002", clientName: "Acme", totalCents: 250_000 }),
    ];
    const result = findInvoiceMatches(
      { amountCents: 250_000, postedAt: isoToUtcDate("2026-06-15"), description: "ACME ACH" },
      invoices
    );
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.confidence === "MEDIUM")).toBe(true);
    expect(result.some((r) => r.confidence === "HIGH")).toBe(false);
  });

  it("returns [] when nothing matches the amount", () => {
    const invoices = [invoice({ id: "1", totalCents: 123_456 })];
    const result = findInvoiceMatches(
      { amountCents: 100_000, postedAt: isoToUtcDate("2026-06-15"), description: "DEPOSIT" },
      invoices
    );
    expect(result).toEqual([]);
  });
});
