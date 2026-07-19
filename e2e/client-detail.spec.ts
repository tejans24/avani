import { test, expect } from "@playwright/test";
import { insertClient, insertInvoice, resetDb } from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

test("client detail page shows the client's invoices and money summary", async ({ page }) => {
  const acme = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });
  const globex = await insertClient({ name: "Globex Inc", billingEmail: "ap@globex.example" });

  await insertInvoice(acme.id, {
    status: "PAID",
    totalCents: 500000,
    issueDate: "2026-06-01",
    dueDate: "2026-06-30",
    paidAt: "2026-06-20",
    number: "INV-ACME-0001",
  });
  await insertInvoice(acme.id, {
    status: "SENT",
    totalCents: 200000,
    issueDate: "2026-07-01",
    dueDate: "2026-07-31",
    number: "INV-ACME-0002",
  });
  await insertInvoice(globex.id, {
    status: "SENT",
    totalCents: 999900,
    issueDate: "2026-07-02",
    dueDate: "2026-08-01",
    number: "INV-GLOB-0001",
  });

  await page.goto(`/clients/${acme.id}`);

  await expect(page.getByRole("heading", { name: "Acme Corp" })).toBeVisible();
  // Money summary (amounts also appear as invoice-row totals, so use first()):
  // billed 5000+2000, collected 5000, outstanding 2000.
  await expect(page.getByText("$7,000.00").first()).toBeVisible(); // billed
  await expect(page.getByText("$5,000.00").first()).toBeVisible(); // collected
  await expect(page.getByText("$2,000.00").first()).toBeVisible(); // outstanding

  // Only Acme's invoices appear; Globex's does not.
  await expect(page.getByRole("cell", { name: "INV-ACME-0001" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "INV-ACME-0002" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "INV-GLOB-0001" })).toHaveCount(0);
});

test("New invoice from the client page pre-selects that client", async ({ page }) => {
  const acme = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });

  await page.goto(`/clients/${acme.id}`);
  await page.getByRole("link", { name: "New invoice" }).first().click();

  await page.waitForURL(new RegExp(`/invoices/new\\?client=${acme.id}`));
  await expect(page.getByLabel("Client")).toHaveValue(acme.id);
});

test("client name in the invoices list links to the client page", async ({ page }) => {
  const acme = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });
  await insertInvoice(acme.id, {
    status: "SENT",
    totalCents: 100000,
    issueDate: "2026-07-01",
    dueDate: "2026-07-31",
    number: "INV-ACME-0001",
  });

  await page.goto("/invoices");
  await page.getByRole("cell", { name: "Acme Corp" }).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/clients/${acme.id}$`));
  await expect(page.getByRole("heading", { name: "Acme Corp" })).toBeVisible();
});
