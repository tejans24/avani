import { describe, expect, it } from "vitest";
import { deriveInvoicePrefix, formatInvoiceNumber } from "@/lib/invoice-numbering";

describe("invoice numbering", () => {
  it("formats prefixed numbers", () => {
    expect(formatInvoiceNumber("ACME", 1)).toBe("INV-ACME-0001");
    expect(formatInvoiceNumber("GL2", 123)).toBe("INV-GL2-0123");
  });

  it("derives 3-4 letter prefixes from company names", () => {
    expect(deriveInvoicePrefix("Acme Corp")).toBe("ACME");
    expect(deriveInvoicePrefix("Globex")).toBe("GLOB");
    expect(deriveInvoicePrefix("3M Company")).toBe("3MCO");
    expect(deriveInvoicePrefix("A.B. Consulting")).toBe("ABCO");
    expect(deriveInvoicePrefix("与力 Yoriki LLC")).toBe("YORI");
  });

  it("falls back and pads degenerate names", () => {
    expect(deriveInvoicePrefix("!!!")).toBe("CLNT");
    expect(deriveInvoicePrefix("X")).toBe("XX");
  });
});
