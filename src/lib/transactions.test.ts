import { describe, expect, it } from "vitest";

import {
  assignOrdinals,
  csvDedupeKey,
  mercuryDedupeKey,
  normalizeCsvAmount,
  normalizeDescription,
} from "@/lib/transactions";

describe("normalizeDescription", () => {
  it("trims and collapses internal whitespace to single spaces", () => {
    expect(normalizeDescription("  AWS   Web    Services  ")).toBe("AWS WEB SERVICES");
    expect(normalizeDescription("a\t b\n c")).toBe("A B C");
  });

  it("uppercases", () => {
    expect(normalizeDescription("Blue Bottle Coffee")).toBe("BLUE BOTTLE COFFEE");
  });

  it("strips a trailing reference-number run of 6+ digits", () => {
    expect(normalizeDescription("PAYMENT REF 123456789")).toBe("PAYMENT REF");
    expect(normalizeDescription("PAYMENT REF 987654321")).toBe("PAYMENT REF");
    expect(normalizeDescription("PAYMENT REF 123456789")).toBe(
      normalizeDescription("PAYMENT REF 987654321")
    );
    expect(normalizeDescription("UNITED AIRLINES 0162345678901")).toBe("UNITED AIRLINES");
  });

  it("keeps short trailing digit runs (fewer than 6 digits)", () => {
    expect(normalizeDescription("FLIGHT UA 12345")).toBe("FLIGHT UA 12345");
    expect(normalizeDescription("STORE #42")).toBe("STORE #42");
  });

  it("does not strip digit runs in the middle of the description", () => {
    expect(normalizeDescription("REF 123456789 PAYMENT")).toBe("REF 123456789 PAYMENT");
  });

  it("does not strip when the digits are the entire description", () => {
    expect(normalizeDescription("123456789")).toBe("123456789");
  });

  it("does not strip tokens that mix digits with other characters", () => {
    expect(normalizeDescription("INVOICE #1234567")).toBe("INVOICE #1234567");
  });
});

describe("mercuryDedupeKey", () => {
  it("prefixes the mercury transaction id", () => {
    expect(mercuryDedupeKey("txn_abc123")).toBe("mercury:txn_abc123");
  });
});

describe("csvDedupeKey", () => {
  const row = {
    dateIso: "2026-07-01",
    amountCents: -2000,
    description: "CURSOR AI SUBSCRIPTION",
    ordinal: 0,
  };

  it("is stable: same input produces the same key", () => {
    expect(csvDedupeKey(row)).toBe(csvDedupeKey({ ...row }));
  });

  it("is a csv-prefixed sha256 hex digest", () => {
    expect(csvDedupeKey(row)).toMatch(/^csv:[0-9a-f]{64}$/);
  });

  it("differs when the ordinal differs", () => {
    expect(csvDedupeKey(row)).not.toBe(csvDedupeKey({ ...row, ordinal: 1 }));
  });

  it("differs when date, amount, or description differ", () => {
    expect(csvDedupeKey(row)).not.toBe(csvDedupeKey({ ...row, dateIso: "2026-07-02" }));
    expect(csvDedupeKey(row)).not.toBe(csvDedupeKey({ ...row, amountCents: -2001 }));
    expect(csvDedupeKey(row)).not.toBe(csvDedupeKey({ ...row, description: "OTHER" }));
  });

  it("normalizes the description, so formatting-only differences dedupe", () => {
    expect(csvDedupeKey(row)).toBe(
      csvDedupeKey({ ...row, description: "  cursor ai   subscription " })
    );
    expect(
      csvDedupeKey({ ...row, description: "PAYMENT REF 123456789" })
    ).toBe(csvDedupeKey({ ...row, description: "PAYMENT REF 987654321" }));
  });
});

describe("assignOrdinals", () => {
  it("gives identical (date, cents, normalized description) rows ordinals 0, 1, ...", () => {
    const rows = [
      { dateIso: "2026-07-10", amountCents: -725, description: "BLUE BOTTLE COFFEE" },
      { dateIso: "2026-07-10", amountCents: -725, description: "BLUE BOTTLE COFFEE" },
    ];
    expect(assignOrdinals(rows).map((r) => r.ordinal)).toEqual([0, 1]);
  });

  it("gives distinct rows ordinal 0", () => {
    const rows = [
      { dateIso: "2026-07-01", amountCents: -2000, description: "CURSOR" },
      { dateIso: "2026-07-02", amountCents: -2000, description: "CURSOR" },
      { dateIso: "2026-07-01", amountCents: -2001, description: "CURSOR" },
      { dateIso: "2026-07-01", amountCents: -2000, description: "GITHUB" },
    ];
    expect(assignOrdinals(rows).map((r) => r.ordinal)).toEqual([0, 0, 0, 0]);
  });

  it("preserves input order and counts interleaved duplicates correctly", () => {
    const dup = { dateIso: "2026-07-10", amountCents: -725, description: "COFFEE" };
    const other = { dateIso: "2026-07-11", amountCents: -100, description: "SNACK" };
    const result = assignOrdinals([dup, other, dup, dup]);
    expect(result.map((r) => r.description)).toEqual(["COFFEE", "SNACK", "COFFEE", "COFFEE"]);
    expect(result.map((r) => r.ordinal)).toEqual([0, 0, 1, 2]);
  });

  it("treats rows whose descriptions normalize identically as duplicates", () => {
    const rows = [
      { dateIso: "2026-07-10", amountCents: -725, description: "Blue Bottle  Coffee" },
      { dateIso: "2026-07-10", amountCents: -725, description: "BLUE BOTTLE COFFEE" },
    ];
    expect(assignOrdinals(rows).map((r) => r.ordinal)).toEqual([0, 1]);
  });

  it("does not mutate the input rows", () => {
    const rows = [{ dateIso: "2026-07-10", amountCents: -725, description: "COFFEE" }];
    assignOrdinals(rows);
    expect(rows[0]).toEqual({ dateIso: "2026-07-10", amountCents: -725, description: "COFFEE" });
  });
});

describe("normalizeCsvAmount", () => {
  it("flips signs when amounts are charges (Amex-style)", () => {
    expect(normalizeCsvAmount(4200, true)).toBe(-4200); // charge -> money out
    expect(normalizeCsvAmount(-5000, true)).toBe(5000); // payment -> money in
  });

  it("passes amounts through when the toggle is off", () => {
    expect(normalizeCsvAmount(4200, false)).toBe(4200);
    expect(normalizeCsvAmount(-5000, false)).toBe(-5000);
  });

  it("keeps zero as positive zero in both modes", () => {
    expect(Object.is(normalizeCsvAmount(0, true), 0)).toBe(true);
    expect(Object.is(normalizeCsvAmount(0, false), 0)).toBe(true);
  });
});
