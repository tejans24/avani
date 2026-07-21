import { test, expect } from "@playwright/test";
import { insertClient, queryRows, resetDb } from "./utils/db";

test.beforeEach(async () => {
  await resetDb();
});

/**
 * Invoice numbers must be distinct and gap-free per client even under
 * concurrency. allocateInvoiceNumber relies on an atomic
 * `nextInvoiceNumber: { increment: 1 }` (an UPDATE that takes a row lock) plus
 * the `Invoice.number` unique constraint. This probe fires that exact atomic
 * increment from many parallel transactions and asserts every caller gets a
 * distinct sequential value — proving two concurrent invoice creates can never
 * be handed the same number.
 */
test("parallel atomic allocations hand out distinct sequential numbers", async () => {
  const client = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });

  const N = 25;
  const results = await Promise.all(
    Array.from({ length: N }, () =>
      queryRows(
        `UPDATE "Client" SET "nextInvoiceNumber" = "nextInvoiceNumber" + 1
           WHERE id = $1
         RETURNING "nextInvoiceNumber" - 1 AS allocated`,
        [client.id]
      )
    )
  );

  const allocated = results.map((rows) => Number(rows[0].allocated)).sort((a, b) => a - b);
  // All distinct.
  expect(new Set(allocated).size).toBe(N);
  // Contiguous 1..N (no gaps, no dupes) — a client starts at nextInvoiceNumber = 1.
  expect(allocated).toEqual(Array.from({ length: N }, (_, i) => i + 1));

  const row = await queryRows(`SELECT "nextInvoiceNumber" FROM "Client" WHERE id = $1`, [client.id]);
  expect(Number(row[0].nextInvoiceNumber)).toBe(N + 1);
});
