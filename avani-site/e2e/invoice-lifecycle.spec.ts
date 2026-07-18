import { test, expect } from "@playwright/test";
import { resetDb, insertClient, insertInvoice, insertLineItem, queryRows } from "./utils/db";

let clientId: string;

test.beforeEach(async () => {
  await resetDb();
  const client = await insertClient();
  clientId = client.id;
});

test("mark a sent invoice as paid", async ({ page }) => {
  const id = await insertInvoice(clientId, {
    status: "SENT",
    totalCents: 100000,
    issueDate: "2026-07-01",
    dueDate: "2026-07-20",
    number: "INV-0100",
  });

  await page.goto(`/invoices/${id}`);
  await page.getByRole("button", { name: "Mark as paid" }).click();
  await page.locator("#paid-date").fill("2026-07-18");
  await page.getByRole("button", { name: "Mark paid", exact: true }).click();
  await expect(page.getByText("Paid", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/paid Jul 18, 2026/)).toBeVisible();
});

test("overdue badge shows for past-due sent invoices", async ({ page }) => {
  await insertInvoice(clientId, {
    status: "SENT",
    totalCents: 50000,
    issueDate: "2026-01-05",
    dueDate: "2026-01-20",
    number: "INV-0101",
  });

  await page.goto("/invoices?status=overdue");
  await expect(page.getByRole("cell", { name: "Overdue" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText("1 invoice past due")).toBeVisible();
});

test("void a sent invoice", async ({ page }) => {
  const id = await insertInvoice(clientId, {
    status: "SENT",
    totalCents: 20000,
    issueDate: "2026-07-01",
    dueDate: "2026-07-20",
    number: "INV-0102",
  });

  await page.goto(`/invoices/${id}`);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Void" }).click();
  await expect(page.getByText("Void", { exact: true }).first()).toBeVisible();
});

test("delete a draft invoice", async ({ page }) => {
  const id = await insertInvoice(clientId, {
    status: "DRAFT",
    totalCents: 10000,
    issueDate: "2026-07-01",
    dueDate: "2026-07-20",
    number: "INV-0103",
  });

  await page.goto(`/invoices/${id}`);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.waitForURL("**/invoices");
  const rows = await queryRows(`SELECT id FROM "Invoice" WHERE id = $1`, [id]);
  expect(rows.length).toBe(0);
});

test("duplicate creates a new draft with the next number", async ({ page }) => {
  const id = await insertInvoice(clientId, {
    status: "PAID",
    totalCents: 594000,
    issueDate: "2026-06-16",
    dueDate: "2026-07-07",
    paidAt: "2026-07-01",
    number: "INV-0104",
  });

  await page.goto(`/invoices/${id}`);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith(`/${id}`), {
    timeout: 20_000,
  });
  await expect(page.getByText("INV-0001")).toBeVisible(); // counter seeded at 1
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
});

test("duplicate for next period shifts description date ranges", async ({ page }) => {
  const id = await insertInvoice(clientId, {
    status: "SENT",
    totalCents: 54000,
    issueDate: "2026-07-02",
    dueDate: "2026-07-16",
    number: "INV-0105",
  });
  await insertLineItem(id, {
    description: "Consulting Services: 06/14/26 – 06/20/26",
    quantity: 6,
    unitPriceCents: 9000,
    amountCents: 54000,
  });

  await page.goto(`/invoices/${id}`);
  await page.getByRole("button", { name: "Duplicate next period" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith(`/${id}`), {
    timeout: 15_000,
  });

  const rows = await queryRows(
    `SELECT li.description, i."issueDate"
       FROM "InvoiceLineItem" li JOIN "Invoice" i ON i.id = li."invoiceId"
      WHERE i.id <> $1`,
    [id]
  );
  expect(rows.length).toBe(1);
  expect(rows[0].description).toBe("Consulting Services: 06/28/26 – 07/04/26");
  expect(rows[0].issueDate.toISOString().slice(0, 10)).toBe("2026-07-16");
});
