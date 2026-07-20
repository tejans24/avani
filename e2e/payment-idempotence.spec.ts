import { test, expect } from "@playwright/test";
import {
  resetDb,
  insertClient,
  insertInvoice,
  insertAccount,
  insertTransaction,
  queryRows,
} from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

async function paidEventCount(invoiceId: string): Promise<number> {
  const rows = await queryRows(
    `SELECT count(*)::int AS n FROM "DomainEvent" WHERE type = 'invoice.paid' AND "entityId" = $1`,
    [invoiceId]
  );
  return rows[0].n as number;
}

/**
 * An invoice must be paid AT MOST ONCE. The two payment paths — a manual
 * "mark paid" and a confirmed bank-deposit match — must never both fire
 * invoice.paid for the same invoice (that would double-send the client a
 * receipt and double-log the payment). The SENT->PAID transition is a
 * conditional atomic flip, so whichever path lands first wins and the other
 * becomes a no-op.
 */
test("manual mark-paid then a matching deposit does not pay twice", async ({ page }) => {
  const client = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });
  const invoiceId = await insertInvoice(client.id, {
    status: "SENT",
    totalCents: 594000,
    issueDate: "2026-07-01",
    dueDate: "2026-08-15",
    number: "INV-ACME-0001",
  });
  // A same-amount deposit exists and would otherwise be a strong match.
  const account = await insertAccount();
  await insertTransaction(account.id, {
    postedAt: "2026-07-10",
    amountCents: 594000,
    description: "ACME ACH",
  });

  // Path 1: mark it paid manually from the invoice page.
  await page.goto(`/invoices/${invoiceId}`);
  await page.getByRole("button", { name: "Mark as paid" }).click();
  await page.getByRole("button", { name: "Mark paid", exact: true }).click();
  await expect(page.getByText("Paid", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await paidEventCount(invoiceId)).toBe(1);

  // Path 2: the deposit is no longer offered as a match (invoice isn't SENT),
  // so it can't pay the invoice again.
  await page.goto("/transactions");
  await expect(page.getByText(/looks like Acme Corp's payment/)).toHaveCount(0);

  // Exactly one payment event, ever.
  expect(await paidEventCount(invoiceId)).toBe(1);
  const inv = await queryRows(`SELECT status FROM "Invoice" WHERE id = $1`, [invoiceId]);
  expect(inv[0].status).toBe("PAID");
});

test("confirming a deposit then re-marking paid is rejected (single payment event)", async ({
  page,
}) => {
  const client = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });
  const invoiceId = await insertInvoice(client.id, {
    status: "SENT",
    totalCents: 100000,
    issueDate: "2026-07-01",
    dueDate: "2026-08-15",
    number: "INV-ACME-0002",
  });
  const account = await insertAccount();
  await insertTransaction(account.id, {
    postedAt: "2026-07-10",
    amountCents: 100000,
    description: "ACME ACH",
  });

  // Path 1: confirm the bank match.
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText(/looks like Acme Corp's payment/)).toHaveCount(0, { timeout: 20_000 });
  expect(await paidEventCount(invoiceId)).toBe(1);

  // Path 2: the invoice page no longer offers "Mark as paid" (it's PAID).
  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as paid" })).toHaveCount(0);

  expect(await paidEventCount(invoiceId)).toBe(1);
});
