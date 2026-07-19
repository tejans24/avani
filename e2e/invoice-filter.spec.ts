import { test, expect } from "@playwright/test";
import { insertClient, insertInvoice, resetDb } from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

test("global invoices list filters by client and preserves status", async ({ page }) => {
  const acme = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });
  const globex = await insertClient({ name: "Globex Inc", billingEmail: "ap@globex.example" });

  await insertInvoice(acme.id, {
    status: "SENT",
    totalCents: 100000,
    issueDate: "2026-07-01",
    dueDate: "2026-07-31",
    number: "INV-ACME-0001",
  });
  await insertInvoice(globex.id, {
    status: "SENT",
    totalCents: 200000,
    issueDate: "2026-07-02",
    dueDate: "2026-08-01",
    number: "INV-GLOB-0001",
  });
  await insertInvoice(acme.id, {
    status: "PAID",
    totalCents: 50000,
    issueDate: "2026-06-01",
    dueDate: "2026-06-30",
    paidAt: "2026-06-20",
    number: "INV-ACME-0002",
  });

  await page.goto("/invoices");
  // All three visible unfiltered.
  await expect(page.getByRole("cell", { name: "INV-ACME-0001" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "INV-GLOB-0001" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "INV-ACME-0002" })).toBeVisible();

  // Filter to Acme → Globex disappears, both Acme rows remain.
  await page.getByLabel("Filter by client").selectOption({ label: "Acme Corp" });
  await expect(page).toHaveURL(new RegExp(`client=${acme.id}`));
  await expect(page.getByRole("cell", { name: "INV-ACME-0001" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "INV-ACME-0002" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "INV-GLOB-0001" })).toHaveCount(0);

  // Add a status filter → client filter is preserved in the URL and the list.
  await page.getByRole("link", { name: "Paid", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`status=paid`));
  await expect(page).toHaveURL(new RegExp(`client=${acme.id}`));
  await expect(page.getByRole("cell", { name: "INV-ACME-0002" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "INV-ACME-0001" })).toHaveCount(0);

  // The client dropdown retains its selection across the status navigation.
  await expect(page.getByLabel("Filter by client")).toHaveValue(acme.id);
});
