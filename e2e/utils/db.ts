import { Client } from "pg";
import { TEST_DATABASE_URL } from "../../playwright.config";
import { CATEGORY_SEEDS } from "../../prisma/seed-categories";

async function withPg<T>(fn: (pg: Client) => Promise<T>): Promise<T> {
  const pg = new Client({ connectionString: TEST_DATABASE_URL });
  await pg.connect();
  try {
    return await fn(pg);
  } finally {
    await pg.end();
  }
}

/** Truncate all app tables and re-seed singletons + the category chart. */
export async function resetDb() {
  await withPg(async (pg) => {
    await pg.query(
      `TRUNCATE "InvoiceLineItem", "Invoice", "Client", "CompanySettings",
                "Transaction", "CategoryRule", "Category", "FinancialAccount",
                "TaxSettings", "QuarterlyEstimatePayment", "ComplianceDeadline",
                "HandlerRun", "DomainEvent", "Notification"
       RESTART IDENTITY CASCADE`
    );
    for (const [i, c] of CATEGORY_SEEDS.entries()) {
      await pg.query(
        `INSERT INTO "Category" (id, name, kind, "taxLine", "deductiblePct", "sortOrder", system)
         VALUES ($1, $2, $3::"CategoryKind", $4::"TaxLine", $5, $6, true)`,
        [`testcat_${i}`, c.name, c.kind, c.taxLine, c.deductiblePct ?? 100, i]
      );
    }
    await pg.query(
      `INSERT INTO "TaxSettings" (id, state, "federalRateBps", "stateRateBps",
        "ownerSalaryAnnualCents", "withholdingYtdCents", "updatedAt")
       VALUES (1, 'CA', 2400, 930, 0, 0, NOW())`
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

/** Insert a line item for an invoice created via insertInvoice. */
export async function insertLineItem(
  invoiceId: string,
  item: {
    description: string;
    quantity: number;
    unitPriceCents: number;
    amountCents: number;
    sortOrder?: number;
  }
) {
  const id = `testli_${Math.random().toString(36).slice(2, 10)}`;
  await withPg((pg) =>
    pg.query(
      `INSERT INTO "InvoiceLineItem"
        (id, "invoiceId", description, quantity, "unitPriceCents", "amountCents", "sortOrder")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        invoiceId,
        item.description,
        item.quantity,
        item.unitPriceCents,
        item.amountCents,
        item.sortOrder ?? 0,
      ]
    )
  );
  return id;
}

export async function queryRows(sql: string, params: unknown[] = []) {
  return withPg(async (pg) => (await pg.query(sql, params)).rows);
}

/** Insert a financial account directly. */
export async function insertAccount(overrides: Partial<Record<string, unknown>> = {}) {
  const id = `testacct_${Math.random().toString(36).slice(2, 10)}`;
  const a = {
    id,
    name: "Mercury Checking",
    kind: "BANK",
    institution: "Mercury",
    mask: "1234",
    source: "CSV",
    amountsAreCharges: false,
    ...overrides,
  } as Record<string, unknown>;
  await withPg((pg) =>
    pg.query(
      `INSERT INTO "FinancialAccount"
        (id, name, kind, institution, mask, source, "amountsAreCharges", archived, "createdAt", "updatedAt")
       VALUES ($1,$2,$3::"AccountKind",$4,$5,$6::"AccountSource",$7,false,NOW(),NOW())`,
      [a.id, a.name, a.kind, a.institution, a.mask, a.source, a.amountsAreCharges]
    )
  );
  return a as { id: string; name: string };
}

/** Insert a transaction directly (signed cents, business perspective). */
export async function insertTransaction(
  accountId: string,
  t: {
    postedAt: string | Date;
    amountCents: number;
    description: string;
    merchant?: string | null;
    categoryId?: string | null;
    status?: "UNREVIEWED" | "REVIEWED" | "EXCLUDED";
    matchedInvoiceId?: string | null;
  }
) {
  const id = `testtxn_${Math.random().toString(36).slice(2, 10)}`;
  await withPg((pg) =>
    pg.query(
      `INSERT INTO "Transaction"
        (id, "accountId", "postedAt", "amountCents", description, merchant, "dedupeKey",
         "categoryId", "matchedInvoiceId", status, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::"TransactionStatus",NOW(),NOW())`,
      [
        id,
        accountId,
        t.postedAt,
        t.amountCents,
        t.description,
        t.merchant ?? null,
        `test:${id}`,
        t.categoryId ?? null,
        t.matchedInvoiceId ?? null,
        t.status ?? "UNREVIEWED",
      ]
    )
  );
  return id;
}

/** Look up a seeded category id by its unique name. */
export async function getCategoryIdByName(name: string): Promise<string> {
  const rows = await queryRows(`SELECT id FROM "Category" WHERE name = $1`, [name]);
  if (!rows[0]) throw new Error(`Category not found: ${name}`);
  return rows[0].id as string;
}
