import { describe, expect, it } from "vitest";

import { isoToUtcDate } from "@/lib/dates";
import { findTransferMatches, type TransferTxnLike } from "@/lib/transfer-matching";

function txn(o: Partial<TransferTxnLike> & { id: string }): TransferTxnLike {
  return {
    accountId: "acct-bank",
    accountName: "Mercury Checking",
    postedAt: isoToUtcDate("2026-07-10"),
    amountCents: -5000,
    description: "AMEX EPAYMENT",
    ...o,
  };
}

describe("findTransferMatches", () => {
  const bankPayment = { id: "bank", accountId: "acct-bank", postedAt: isoToUtcDate("2026-07-10"), amountCents: -5000 };

  it("pairs an equal-and-opposite entry on another account", () => {
    const candidates = [
      txn({ id: "card", accountId: "acct-card", accountName: "Amex", amountCents: 5000 }),
    ];
    const result = findTransferMatches(bankPayment, candidates);
    expect(result).toHaveLength(1);
    expect(result[0].transactionId).toBe("card");
    expect(result[0].accountName).toBe("Amex");
  });

  it("never pairs a transaction on the SAME account (e.g. the card charge)", () => {
    const candidates = [
      // The actual purchase on the card — same sign situation but same account.
      txn({ id: "same-acct", accountId: "acct-bank", amountCents: 5000 }),
    ];
    expect(findTransferMatches(bankPayment, candidates)).toEqual([]);
  });

  it("requires the exact opposite amount", () => {
    const candidates = [
      txn({ id: "off-by-one", accountId: "acct-card", amountCents: 5001 }),
      txn({ id: "same-sign", accountId: "acct-card", amountCents: -5000 }),
    ];
    expect(findTransferMatches(bankPayment, candidates)).toEqual([]);
  });

  it("respects the date window", () => {
    const near = txn({ id: "near", accountId: "acct-card", amountCents: 5000, postedAt: isoToUtcDate("2026-07-13") });
    const far = txn({ id: "far", accountId: "acct-card", amountCents: 5000, postedAt: isoToUtcDate("2026-07-20") });
    const result = findTransferMatches(bankPayment, [far, near]);
    expect(result.map((r) => r.transactionId)).toEqual(["near"]); // far is outside 5 days
  });

  it("sorts multiple candidates by date proximity", () => {
    const d1 = txn({ id: "d1", accountId: "acct-card", amountCents: 5000, postedAt: isoToUtcDate("2026-07-12") });
    const d2 = txn({ id: "d2", accountId: "acct-savings", amountCents: 5000, postedAt: isoToUtcDate("2026-07-11") });
    const result = findTransferMatches(bankPayment, [d1, d2]);
    expect(result.map((r) => r.transactionId)).toEqual(["d2", "d1"]);
  });

  it("returns [] for a zero-amount transaction", () => {
    const zero = { id: "z", accountId: "acct-bank", postedAt: isoToUtcDate("2026-07-10"), amountCents: 0 };
    const candidates = [txn({ id: "card", accountId: "acct-card", amountCents: 0 })];
    expect(findTransferMatches(zero, candidates)).toEqual([]);
  });
});
