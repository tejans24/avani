import { test, expect } from "@playwright/test";
import { resetDb, insertClient, insertInvoice, queryRows } from "./utils/db";

test.beforeEach(async () => {
  await resetDb();
});

test("settings edits persist across reload", async ({ page }) => {
  await page.goto("/settings");
  const name = page.locator("#companyName");
  await expect(name).toHaveValue("Avani Consulting LLC");
  await name.fill("Avani Consulting Inc");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText(/saved/i)).toBeVisible();

  await page.reload();
  await expect(page.locator("#companyName")).toHaveValue("Avani Consulting Inc");
});

test("sent invoice keeps its From snapshot after settings change", async ({
  page,
}) => {
  const client = await insertClient();
  const invoiceId = await insertInvoice(client.id, {
    status: "DRAFT",
    totalCents: 100000,
    issueDate: "2026-07-01",
    dueDate: "2026-07-20",
    number: "INV-0010",
  });

  // Send it (freezes the snapshot with the original company name)
  await page.goto(`/invoices/${invoiceId}`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Send invoice" }).click();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  // Change company name in settings
  await page.goto("/settings");
  await page.locator("#companyName").fill("Renamed Co");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText(/saved/i)).toBeVisible();

  // Snapshot on the sent invoice is unchanged
  const rows = await queryRows(
    `SELECT "fromSnapshot" FROM "Invoice" WHERE id = $1`,
    [invoiceId]
  );
  expect(rows[0].fromSnapshot.companyName).toBe("Avani Consulting LLC");
});
