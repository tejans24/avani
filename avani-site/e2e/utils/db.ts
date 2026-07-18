import { Client } from "pg";
import { TEST_DATABASE_URL } from "../../playwright.config";

async function withPg<T>(fn: (pg: Client) => Promise<T>): Promise<T> {
  const pg = new Client({ connectionString: TEST_DATABASE_URL });
  await pg.connect();
  try {
    return await fn(pg);
  } finally {
    await pg.end();
  }
}

/** Truncate all app tables and re-seed the CompanySettings singleton. */
export async function resetDb() {
  await withPg(async (pg) => {
    await pg.query(
      `TRUNCATE "InvoiceLineItem", "Invoice", "Client", "CompanySettings" RESTART IDENTITY CASCADE`
    );
    await pg.query(
      `INSERT INTO "CompanySettings"
        (id, "companyName", "addressLine1", "addressLine2", city, state, "postalCode", country,
         email, phone, "payViaLabel", "paymentInstructions", "defaultTerms",
         "defaultNetBusinessDays", "defaultTaxRateBps", "nextInvoiceNumber", "updatedAt")
       VALUES
        (1, 'Avani Consulting LLC', '123 Main St', 'Suite 100', 'San Francisco', 'CA', '94105', 'USA',
         'invoices@avani.example', '(555) 555-0100', 'Manual transfer (ACH/Wire)',
         E'Bank: Mercury Business\\nRouting number: 000000000\\nAccount number: 0000000000\\nAccount name: Avani Consulting LLC',
         'Net 15 business days.', 15, 0, 1, NOW())`
    );
  });
}

/** Insert a client directly (for specs that need one without driving the UI). */
export async function insertClient(overrides: Partial<Record<string, unknown>> = {}) {
  const id = `test_${Math.random().toString(36).slice(2, 10)}`;
  const c = {
    id,
    name: "Acme Corp",
    contactName: "Pat Doe",
    billingEmail: "billing@acme.example",
    ccEmails: ["accounting@acme.example"],
    addressLine1: "456 Market St",
    city: "New York",
    state: "NY",
    postalCode: "10001",
    country: "USA",
    ...overrides,
  } as Record<string, unknown>;
  await withPg((pg) =>
    pg.query(
      `INSERT INTO "Client"
        (id, name, "contactName", "billingEmail", "ccEmails", "addressLine1", city, state, "postalCode", country, archived, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,NOW(),NOW())`,
      [
        c.id,
        c.name,
        c.contactName,
        c.billingEmail,
        c.ccEmails,
        c.addressLine1,
        c.city,
        c.state,
        c.postalCode,
        c.country,
      ]
    )
  );
  return c as { id: string; name: string; billingEmail: string; ccEmails: string[] };
}

/**
 * Insert an invoice directly (for specs that need data without driving the UI).
 * subtotal = total, tax 0; no line items (reports don't need them).
 * Dates accept "YYYY-MM-DD" strings or Date objects.
 */
export async function insertInvoice(
  clientId: string,
  inv: {
    status: "DRAFT" | "SENT" | "PAID" | "VOID";
    totalCents: number;
    issueDate: string | Date;
    dueDate: string | Date;
    paidAt?: string | Date | null;
    number: string;
  }
) {
  const id = `testinv_${Math.random().toString(36).slice(2, 10)}`;
  const sentAt = inv.status === "DRAFT" ? null : inv.issueDate;
  await withPg((pg) =>
    pg.query(
      `INSERT INTO "Invoice"
        (id, number, "clientId", status, "issueDate", "dueDate", "taxRateBps",
         "subtotalCents", "taxCents", "totalCents", "sentAt", "paidAt", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,0,$7,$8,$9,NOW(),NOW())`,
      [
        id,
        inv.number,
        clientId,
        inv.status,
        inv.issueDate,
        inv.dueDate,
        inv.totalCents,
        sentAt,
        inv.paidAt ?? null,
      ]
    )
  );
  return id;
}

export async function queryRows(sql: string, params: unknown[] = []) {
  return withPg(async (pg) => (await pg.query(sql, params)).rows);
}
