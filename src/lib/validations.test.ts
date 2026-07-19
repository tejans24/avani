import { describe, expect, it } from "vitest";

import {
  clientSchema,
  invoiceSchema,
  lineItemSchema,
  sendInvoiceSchema,
  settingsSchema,
} from "@/lib/validations";

const validLineItem = {
  description: "Consulting services",
  quantity: 37.5,
  unitPriceCents: 9000,
};

const validInvoice = {
  clientId: "clnt_123",
  issueDate: "2026-07-16",
  dueDate: "2026-08-06",
  taxRateBps: 875,
  memo: "Thanks for your business",
  lineItems: [validLineItem],
};

const validSettings = {
  companyName: "Avani Consulting LLC",
  addressLine1: "123 Main St",
  city: "Austin",
  state: "TX",
  postalCode: "78701",
  country: "USA",
  email: "billing@avani.example",
  payViaLabel: "ACH / Wire",
  paymentInstructions: "Routing 000000000, Account 111111111",
  defaultNetBusinessDays: 15,
  defaultTaxRateBps: 0,
};

describe("clientSchema", () => {
  it("accepts a minimal valid client and defaults ccEmails to []", () => {
    const result = clientSchema.safeParse({
      name: "Mercury Labs",
      billingEmail: "ap@mercury.example",
    });
    expect(result.success).toBe(true);
    expect(result.data?.ccEmails).toEqual([]);
  });

  it("trims the name and enforces min length", () => {
    const ok = clientSchema.safeParse({ name: "  Acme  ", billingEmail: "a@b.co" });
    expect(ok.success).toBe(true);
    expect(ok.data?.name).toBe("Acme");

    expect(clientSchema.safeParse({ name: "   ", billingEmail: "a@b.co" }).success).toBe(false);
    expect(clientSchema.safeParse({ name: "", billingEmail: "a@b.co" }).success).toBe(false);
  });

  it("rejects a bad billing email and bad cc emails", () => {
    expect(clientSchema.safeParse({ name: "Acme", billingEmail: "not-an-email" }).success).toBe(
      false
    );
    expect(
      clientSchema.safeParse({
        name: "Acme",
        billingEmail: "a@b.co",
        ccEmails: ["ok@b.co", "nope"],
      }).success
    ).toBe(false);
  });

  it("rejects an overly long name", () => {
    expect(
      clientSchema.safeParse({ name: "x".repeat(201), billingEmail: "a@b.co" }).success
    ).toBe(false);
  });

  it("accepts optional address fields", () => {
    const result = clientSchema.safeParse({
      name: "Acme",
      billingEmail: "a@b.co",
      contactName: "Jane Doe",
      addressLine1: "1 Infinite Loop",
      addressLine2: "Suite 4",
      city: "Cupertino",
      state: "CA",
      postalCode: "95014",
      country: "USA",
      notes: "Net 15 preferred",
    });
    expect(result.success).toBe(true);
  });
});

describe("lineItemSchema", () => {
  it("accepts a valid line item", () => {
    expect(lineItemSchema.safeParse(validLineItem).success).toBe(true);
  });

  it("rejects empty or overlong descriptions", () => {
    expect(lineItemSchema.safeParse({ ...validLineItem, description: "" }).success).toBe(false);
    expect(
      lineItemSchema.safeParse({ ...validLineItem, description: "x".repeat(501) }).success
    ).toBe(false);
  });

  it("rejects zero, negative, and out-of-range quantities", () => {
    expect(lineItemSchema.safeParse({ ...validLineItem, quantity: 0 }).success).toBe(false);
    expect(lineItemSchema.safeParse({ ...validLineItem, quantity: -1 }).success).toBe(false);
    expect(lineItemSchema.safeParse({ ...validLineItem, quantity: 100000 }).success).toBe(false);
    expect(lineItemSchema.safeParse({ ...validLineItem, quantity: 99999.99 }).success).toBe(true);
  });

  it("rejects quantities with more than 2 decimal places", () => {
    expect(lineItemSchema.safeParse({ ...validLineItem, quantity: 1.005 }).success).toBe(false);
    expect(lineItemSchema.safeParse({ ...validLineItem, quantity: 2.333 }).success).toBe(false);
    expect(lineItemSchema.safeParse({ ...validLineItem, quantity: 2.33 }).success).toBe(true);
    expect(lineItemSchema.safeParse({ ...validLineItem, quantity: 2.5 }).success).toBe(true);
  });

  it("rejects negative, fractional, and out-of-range unit prices", () => {
    expect(lineItemSchema.safeParse({ ...validLineItem, unitPriceCents: -1 }).success).toBe(false);
    expect(lineItemSchema.safeParse({ ...validLineItem, unitPriceCents: 90.5 }).success).toBe(
      false
    );
    expect(
      lineItemSchema.safeParse({ ...validLineItem, unitPriceCents: 100_000_001 }).success
    ).toBe(false);
    expect(lineItemSchema.safeParse({ ...validLineItem, unitPriceCents: 0 }).success).toBe(true);
  });
});

describe("invoiceSchema", () => {
  it("accepts a valid invoice", () => {
    expect(invoiceSchema.safeParse(validInvoice).success).toBe(true);
  });

  it("requires a client", () => {
    const result = invoiceSchema.safeParse({ ...validInvoice, clientId: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Select a client");
  });

  it("rejects malformed dates", () => {
    expect(invoiceSchema.safeParse({ ...validInvoice, issueDate: "07/16/2026" }).success).toBe(
      false
    );
    expect(invoiceSchema.safeParse({ ...validInvoice, dueDate: "2026-8-6" }).success).toBe(false);
  });

  it("rejects dueDate before issueDate but allows same-day", () => {
    expect(
      invoiceSchema.safeParse({ ...validInvoice, issueDate: "2026-07-16", dueDate: "2026-07-15" })
        .success
    ).toBe(false);
    expect(
      invoiceSchema.safeParse({ ...validInvoice, issueDate: "2026-07-16", dueDate: "2026-07-16" })
        .success
    ).toBe(true);
  });

  it("rejects out-of-range or fractional tax rates", () => {
    expect(invoiceSchema.safeParse({ ...validInvoice, taxRateBps: -1 }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...validInvoice, taxRateBps: 10001 }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...validInvoice, taxRateBps: 87.5 }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...validInvoice, taxRateBps: 0 }).success).toBe(true);
    expect(invoiceSchema.safeParse({ ...validInvoice, taxRateBps: 10000 }).success).toBe(true);
  });

  it("rejects empty line items", () => {
    expect(invoiceSchema.safeParse({ ...validInvoice, lineItems: [] }).success).toBe(false);
  });

  it("rejects invalid nested line items", () => {
    expect(
      invoiceSchema.safeParse({
        ...validInvoice,
        lineItems: [{ ...validLineItem, quantity: 1.234 }],
      }).success
    ).toBe(false);
  });

  it("allows omitting the memo", () => {
    const { memo, ...withoutMemo } = validInvoice;
    expect(invoiceSchema.safeParse(withoutMemo).success).toBe(true);
  });
});

describe("settingsSchema", () => {
  it("accepts valid settings", () => {
    expect(settingsSchema.safeParse(validSettings).success).toBe(true);
  });

  it("requires the non-optional strings", () => {
    for (const key of [
      "companyName",
      "addressLine1",
      "city",
      "state",
      "postalCode",
      "country",
      "payViaLabel",
      "paymentInstructions",
    ] as const) {
      expect(settingsSchema.safeParse({ ...validSettings, [key]: "" }).success).toBe(false);
    }
  });

  it("rejects a bad email", () => {
    expect(settingsSchema.safeParse({ ...validSettings, email: "nope" }).success).toBe(false);
  });

  it("bounds defaultNetBusinessDays to 0..365", () => {
    expect(
      settingsSchema.safeParse({ ...validSettings, defaultNetBusinessDays: -1 }).success
    ).toBe(false);
    expect(
      settingsSchema.safeParse({ ...validSettings, defaultNetBusinessDays: 366 }).success
    ).toBe(false);
    expect(settingsSchema.safeParse({ ...validSettings, defaultNetBusinessDays: 0 }).success).toBe(
      true
    );
    expect(
      settingsSchema.safeParse({ ...validSettings, defaultNetBusinessDays: 365 }).success
    ).toBe(true);
  });

  it("defaults defaultNetDaysMode to BUSINESS and accepts CALENDAR", () => {
    const parsed = settingsSchema.safeParse(validSettings);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.defaultNetDaysMode).toBe("BUSINESS");
    expect(
      settingsSchema.safeParse({ ...validSettings, defaultNetDaysMode: "CALENDAR" }).data
        ?.defaultNetDaysMode
    ).toBe("CALENDAR");
  });

  it("bounds tax rate", () => {
    expect(
      settingsSchema.safeParse({ ...validSettings, defaultTaxRateBps: 10001 }).success
    ).toBe(false);
  });

  it("validates client invoice prefixes", () => {
    const base = { name: "Acme Corp", billingEmail: "a@b.co" };
    expect(clientSchema.safeParse({ ...base, invoicePrefix: "ACME" }).success).toBe(true);
    expect(clientSchema.safeParse({ ...base, invoicePrefix: "" }).success).toBe(true);
    expect(clientSchema.safeParse({ ...base, invoicePrefix: "acme" }).success).toBe(true); // uppercased
    expect(clientSchema.safeParse({ ...base, invoicePrefix: "A" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...base, invoicePrefix: "TOOLONGG" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...base, invoicePrefix: "AC-ME" }).success).toBe(false);
  });
});

describe("sendInvoiceSchema", () => {
  it("accepts a valid payload and defaults cc to []", () => {
    const result = sendInvoiceSchema.safeParse({ to: "ap@client.example" });
    expect(result.success).toBe(true);
    expect(result.data?.cc).toEqual([]);
  });

  it("accepts cc addresses", () => {
    const result = sendInvoiceSchema.safeParse({
      to: "ap@client.example",
      cc: ["boss@client.example", "finance@client.example"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects bad to/cc emails", () => {
    expect(sendInvoiceSchema.safeParse({ to: "nope" }).success).toBe(false);
    expect(
      sendInvoiceSchema.safeParse({ to: "ok@client.example", cc: ["bad"] }).success
    ).toBe(false);
  });
});
