import { test, expect } from "@playwright/test";
import { insertClient, insertInvoice, insertLineItem, queryRows, resetDb } from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

test("manually logging a call shows it on the timeline", async ({ page }) => {
  const acme = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });

  await page.goto(`/clients/${acme.id}?tab=timeline`);
  await expect(page.getByText("No interactions logged yet")).toBeVisible();

  await page.locator("#type").selectOption("CALL");
  await page.locator("#subject").fill("Discovery call");
  await page.locator("#body").fill("Walked through their hiring problem. Follow up next week.");
  await page.getByRole("button", { name: "Log interaction" }).click();

  const row = page.getByTestId("interaction-row").filter({ hasText: "Discovery call" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Call", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Walked through their hiring problem. Follow up next week.")
  ).toBeVisible();
  // Timeline tab is badged with the count.
  await expect(page.getByRole("link", { name: "Timeline (1)" })).toBeVisible();
});

test("sending an invoice auto-logs an EMAIL interaction on the client's timeline", async ({
  page,
}) => {
  const client = await insertClient({
    name: "Acme Corp",
    billingEmail: "billing@acme.example",
    ccEmails: [],
  });
  const invoiceId = await insertInvoice(client.id, {
    status: "DRAFT",
    totalCents: 90000,
    issueDate: "2026-07-16",
    dueDate: "2026-08-07",
    number: "INV-ACME-0001",
  });
  await insertLineItem(invoiceId, {
    description: "Consulting",
    quantity: 10,
    unitPriceCents: 9000,
    amountCents: 90000,
  });

  await page.goto(`/invoices/${invoiceId}`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Send invoice" }).click();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible({ timeout: 20_000 });

  // The auto-logged interaction exists in the DB with a source tag...
  await expect
    .poll(
      async () => {
        const rows = await queryRows(
          `SELECT type, direction, source FROM "Interaction" WHERE "clientId" = $1`,
          [client.id]
        );
        return rows.length;
      },
      { timeout: 10_000 }
    )
    .toBe(1);
  const rows = await queryRows(
    `SELECT type, direction, source FROM "Interaction" WHERE "clientId" = $1`,
    [client.id]
  );
  expect(rows[0].type).toBe("EMAIL");
  expect(rows[0].direction).toBe("OUTBOUND");
  expect(rows[0].source).toBe("invoice.sent:INV-ACME-0001");

  // ...and it renders on the timeline, tagged "Auto".
  await page.goto(`/clients/${client.id}?tab=timeline`);
  const autoRow = page.getByTestId("interaction-row").filter({ hasText: "INV-ACME-0001" });
  await expect(autoRow).toBeVisible();
  await expect(autoRow.getByText("Auto")).toBeVisible();
});
