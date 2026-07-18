import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resetDb, insertClient, insertInvoice, insertLineItem, queryRows } from "./utils/db";

const FAKE_DIR = join(__dirname, "..", ".fake-emails");

function readFakeEmails() {
  let files: string[] = [];
  try {
    files = readdirSync(FAKE_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files
    .sort()
    .map((f) => JSON.parse(readFileSync(join(FAKE_DIR, f), "utf8")));
}

test.beforeEach(async () => {
  await resetDb();
});

test("send flow: prefilled dialog, fake email with PDF, SENT transition", async ({
  page,
}) => {
  const client = await insertClient({
    billingEmail: "billing@acme.example",
    ccEmails: ["accounting@acme.example"],
  });
  const invoiceId = await insertInvoice(client.id, {
    status: "DRAFT",
    totalCents: 594000,
    issueDate: "2026-07-16",
    dueDate: "2026-08-07",
    number: "INV-0007",
  });
  await insertLineItem(invoiceId, {
    description: "Consulting Services: 06/14/26 – 06/20/26",
    quantity: 6,
    unitPriceCents: 9000,
    amountCents: 54000,
  });

  const before = readFakeEmails().length;

  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("#send-to")).toHaveValue("billing@acme.example");
  await expect(page.locator("#send-cc")).toHaveValue("accounting@acme.example");
  await page.getByRole("button", { name: "Send invoice" }).click();

  // First send renders the PDF and writes the fake email — allow dev-server slack
  await expect(page.getByText("Sent", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  // Edit button is gone once sent
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resend" })).toBeVisible();

  const emails = readFakeEmails();
  expect(emails.length).toBe(before + 1);
  const email = emails[emails.length - 1];
  expect(email.to).toBe("billing@acme.example");
  expect(email.cc).toEqual(["accounting@acme.example"]);
  expect(email.subject).toContain("INV-0007");
  expect(email.subject).toContain("$5,940.00");
  expect(email.html).toContain("Payment instructions");
  expect(email.attachments[0].filename).toBe("INV-0007.pdf");
  expect(email.attachments[0].bytes).toBeGreaterThan(3000);

  // fromSnapshot frozen in the DB
  const rows = await queryRows(
    `SELECT "fromSnapshot", status FROM "Invoice" WHERE id = $1`,
    [invoiceId]
  );
  expect(rows[0].status).toBe("SENT");
  expect(rows[0].fromSnapshot.companyName).toBe("Avani Consulting LLC");
});

test("resend keeps status SENT and sends another email", async ({ page }) => {
  const client = await insertClient();
  const invoiceId = await insertInvoice(client.id, {
    status: "SENT",
    totalCents: 100000,
    issueDate: "2026-07-01",
    dueDate: "2026-07-20",
    number: "INV-0008",
  });

  const before = readFakeEmails().length;
  await page.goto(`/invoices/${invoiceId}`);
  await page.getByRole("button", { name: "Resend" }).click();
  await page.getByRole("button", { name: "Send invoice" }).click();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(() => readFakeEmails().length, { timeout: 10_000 })
    .toBe(before + 1);
});

test("send failure surfaces error and stays DRAFT", async ({ page }) => {
  const client = await insertClient();
  const invoiceId = await insertInvoice(client.id, {
    status: "DRAFT",
    totalCents: 50000,
    issueDate: "2026-07-01",
    dueDate: "2026-07-20",
    number: "INV-0009",
  });

  await page.goto(`/invoices/${invoiceId}`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.locator("#send-to").fill("not-an-email");
  await page.getByRole("button", { name: "Send invoice" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  const rows = await queryRows(`SELECT status FROM "Invoice" WHERE id = $1`, [
    invoiceId,
  ]);
  expect(rows[0].status).toBe("DRAFT");
});
