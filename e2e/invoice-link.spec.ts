import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { insertClient, insertInvoice, insertLineItem, queryRows, resetDb } from "./utils/db";

const FAKE_EMAILS = join(__dirname, "..", ".fake-emails");

function latestEmailHtml(): string {
  const files = readdirSync(FAKE_EMAILS).filter((f) => f.endsWith(".json"));
  const parsed = files.map((f) => JSON.parse(readFileSync(join(FAKE_EMAILS, f), "utf8")));
  return parsed[parsed.length - 1].html as string;
}

test.beforeEach(async ({ page }) => {
  await resetDb();
  rmSync(FAKE_EMAILS, { recursive: true, force: true });
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

async function sendSeededInvoice(page: import("@playwright/test").Page) {
  const client = await insertClient();
  const id = await insertInvoice(client.id, {
    status: "DRAFT",
    totalCents: 594000,
    issueDate: "2026-07-16",
    dueDate: "2026-08-07",
    number: "INV-ACME-0009",
  });
  await insertLineItem(id, {
    description: "Consulting Services: 06/14/26 – 06/20/26",
    quantity: 6,
    unitPriceCents: 9000,
    amountCents: 54000,
  });
  await page.goto(`/invoices/${id}`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Send invoice" }).click();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible({ timeout: 20_000 });
  return id;
}

test("send mints a share link; client page renders and records a view", async ({ page }) => {
  const id = await sendSeededInvoice(page);

  // Email contains the View invoice link with the token.
  expect(existsSync(FAKE_EMAILS)).toBeTruthy();
  const html = latestEmailHtml();
  const match = html.match(/\/i\/([A-Za-z0-9_-]{20,64})/);
  expect(match).toBeTruthy();
  const token = match![1];

  const rows = await queryRows(`SELECT "shareToken" FROM "Invoice" WHERE id = $1`, [id]);
  expect(rows[0].shareToken).toBe(token);

  // Public page renders without auth-anything (test mode bypasses anyway,
  // but the route lives outside the platform group entirely).
  await page.goto(`/i/${token}`);
  await expect(page.getByText("INV-ACME-0009")).toBeVisible();
  await expect(page.getByText("$5,940.00").first()).toBeVisible();
  await expect(page.getByTestId("share-status")).toContainText("Awaiting payment");
  await expect(page.getByText("Payment instructions")).toBeVisible();

  // PDF downloads through the tokenized route.
  const pdf = await page.request.get(`/i/${token}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");

  // Viewed event recorded once, throttled on the second visit.
  await page.goto(`/i/${token}`);
  const events = await queryRows(
    `SELECT id FROM "DomainEvent" WHERE type = 'invoice.viewed' AND "entityId" = $1`,
    [id]
  );
  expect(events.length).toBe(1);
});

test("paid invoices show Paid on the client page", async ({ page }) => {
  const id = await sendSeededInvoice(page);
  const rows = await queryRows(`SELECT "shareToken" FROM "Invoice" WHERE id = $1`, [id]);

  await page.reload();
  await page.getByRole("button", { name: "Mark as paid", exact: true }).click();
  await page.getByRole("button", { name: "Mark paid", exact: true }).click();
  await expect(page.getByText("Paid", { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.goto(`/i/${rows[0].shareToken}`);
  await expect(page.getByTestId("share-status")).toContainText("Paid");
  await expect(page.getByText("Payment instructions")).toHaveCount(0);
});

test("void revokes the link; bad tokens 404", async ({ page }) => {
  const id = await sendSeededInvoice(page);
  const rows = await queryRows(`SELECT "shareToken" FROM "Invoice" WHERE id = $1`, [id]);
  const token = rows[0].shareToken as string;

  await page.reload();
  // Void asks via a native confirm() — accept it.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Void", exact: true }).click();
  // Wait for the action to land: the token is cleared in the same transaction.
  await expect
    .poll(
      async () =>
        (await queryRows(`SELECT "shareToken" FROM "Invoice" WHERE id = $1`, [id]))[0]
          .shareToken,
      { timeout: 20_000 }
    )
    .toBeNull();

  const revoked = await page.request.get(`/i/${token}`);
  expect(revoked.status()).toBe(404);

  const bogus = await page.request.get(`/i/definitely-not-a-real-token-12345`);
  expect(bogus.status()).toBe(404);
});
