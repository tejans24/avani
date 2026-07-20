import { test, expect } from "@playwright/test";
import { insertClient, queryRows, resetDb } from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

/**
 * Golden invoice: fixed inputs must produce exact figures that are IDENTICAL
 * across the create form, the stored row, and the client-facing share page.
 * Guards against any display-vs-stored drift on money the client sees.
 *
 * 37.5 h × $90.00 = $3,375.00 subtotal
 * tax 875 bps      = round(337500 × 875 / 10000) = 29531 = $295.31
 * total            = $3,670.31
 */
test("fixed inputs yield identical figures in the form, the DB, and the client page", async ({
  page,
}) => {
  const client = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });

  await page.goto(`/invoices/new?client=${client.id}`);
  await page.getByLabel("Description", { exact: true }).first().fill("Consulting");
  await page.getByLabel("Hours", { exact: true }).first().fill("37.5");
  await page.getByLabel("Rate", { exact: true }).first().fill("90");
  await page.getByLabel("Tax rate (basis points)").fill("875");

  // Form footer computes the golden figures live.
  await expect(page.getByTestId("totals-subtotal")).toHaveText("$3,375.00");
  await expect(page.getByTestId("totals-tax")).toHaveText("$295.31");
  await expect(page.getByTestId("totals-total")).toHaveText("$3,670.31");

  await page.getByRole("button", { name: "Create invoice" }).click();
  await expect(page.getByRole("heading", { name: /INV-ACME-0001/ })).toBeVisible();

  // Stored exactly as computed (integer cents).
  const stored = await queryRows(
    `SELECT "subtotalCents", "taxCents", "totalCents", number FROM "Invoice" WHERE "clientId" = $1`,
    [client.id]
  );
  expect(stored[0]).toMatchObject({
    subtotalCents: 337500,
    taxCents: 29531,
    totalCents: 367031,
    number: "INV-ACME-0001",
  });

  // Send to mint a share token, then confirm the CLIENT sees the same figures.
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Send invoice" }).click();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible({ timeout: 20_000 });

  const tok = await queryRows(`SELECT "shareToken" FROM "Invoice" WHERE "clientId" = $1`, [client.id]);
  const token = tok[0].shareToken as string;
  expect(token).toBeTruthy();

  await page.goto(`/i/${token}`);
  // Subtotal shows as both the line amount and the Subtotal row (identical for
  // a one-line invoice); tax and total likewise repeat — assert each is present.
  await expect(page.getByText("$3,375.00").first()).toBeVisible(); // subtotal
  await expect(page.getByText("$295.31").first()).toBeVisible(); // tax
  await expect(page.getByText("$3,670.31").first()).toBeVisible(); // total
});
