import { test, expect } from "@playwright/test";
import {
  getCategoryIdByName,
  insertAccount,
  insertClient,
  insertInvoice,
  insertTransaction,
  resetDb,
} from "./utils/db";

test.beforeEach(async () => {
  await resetDb();
});

async function seedYear() {
  const acct = await insertAccount();
  const revenue = await getCategoryIdByName("Client Revenue");
  const software = await getCategoryIdByName("Software & Subscriptions");
  const meals = await getCategoryIdByName("Meals (50%)");
  const transfer = await getCategoryIdByName("Transfer Between Accounts");

  // Income: $5,940 in June + $2,000 in July = $7,940
  await insertTransaction(acct.id, {
    postedAt: "2026-06-12",
    amountCents: 594000,
    description: "ACME CORP ACH PAYMENT",
    categoryId: revenue,
    status: "REVIEWED",
  });
  await insertTransaction(acct.id, {
    postedAt: "2026-07-03",
    amountCents: 200000,
    description: "GLOBEX WIRE",
    categoryId: revenue,
    status: "REVIEWED",
  });
  // Expenses: software −$49 (June), meals −$100 (July)
  await insertTransaction(acct.id, {
    postedAt: "2026-06-20",
    amountCents: -4900,
    description: "CURSOR AI SUBSCRIPTION",
    categoryId: software,
    status: "REVIEWED",
  });
  await insertTransaction(acct.id, {
    postedAt: "2026-07-10",
    amountCents: -10000,
    description: "TEAM LUNCH",
    categoryId: meals,
    status: "REVIEWED",
  });
  // Transfer pair nets zero below the line
  await insertTransaction(acct.id, {
    postedAt: "2026-07-15",
    amountCents: -50000,
    description: "TRANSFER TO CARD",
    categoryId: transfer,
    status: "REVIEWED",
  });
  await insertTransaction(acct.id, {
    postedAt: "2026-07-15",
    amountCents: 50000,
    description: "TRANSFER FROM CHECKING",
    categoryId: transfer,
    status: "REVIEWED",
  });
  // Excluded — must not appear anywhere
  await insertTransaction(acct.id, {
    postedAt: "2026-07-16",
    amountCents: -99900,
    description: "PERSONAL SPLURGE",
    status: "EXCLUDED",
  });
  // Uncategorized deposit
  await insertTransaction(acct.id, {
    postedAt: "2026-07-18",
    amountCents: 12300,
    description: "MYSTERY DEPOSIT",
  });
  return acct;
}

test("P&L shows exact numbers, sections, and reconciliation", async ({ page }) => {
  await seedYear();
  // A paid invoice for the reconciliation footnote ($5,940 invoiced+paid).
  const client = await insertClient();
  await insertInvoice(client.id, {
    status: "PAID",
    totalCents: 594000,
    issueDate: "2026-06-01",
    dueDate: "2026-06-22",
    paidAt: "2026-06-12",
    number: "INV-0201",
  });

  await page.goto("/reports/pnl?year=2026");
  const table = page.getByTestId("pnl-table");
  await expect(table).toBeVisible();

  // Income row total: $7,940.00; expenses shown positive: $49.00 and $100.00
  await expect(table.getByText("$7,940.00").first()).toBeVisible();
  await expect(table.getByText("$49.00").first()).toBeVisible();
  await expect(table.getByText("$100.00").first()).toBeVisible();
  // Net profit = 7940 − 149 = $7,791.00
  await expect(page.getByTestId("net-profit")).toHaveText("$7,791.00");
  // Excluded txn is invisible
  await expect(table.getByText("$999.00")).toHaveCount(0);
  // Transfers below the line net to zero (total column shows $0.00)
  await expect(table.getByText("Below the line (owner & transfers)")).toBeVisible();
  // Uncategorized bucket surfaces
  await expect(table.getByText("Uncategorized")).toBeVisible();
  await expect(table.getByText("$123.00").first()).toBeVisible();

  // Reconciliation: invoiced $5,940 vs gross receipts $7,940 → delta surfaced
  await expect(page.getByText(/invoiced & paid \$5,940\.00/)).toBeVisible();
  await expect(page.getByText(/gross-receipts deposits \$7,940\.00/)).toBeVisible();
});

test("P&L cell drills down into filtered transactions", async ({ page }) => {
  await seedYear();
  await page.goto("/reports/pnl?year=2026");
  // June income cell ($5,940.00) links to /transactions?category=<id>&month=2026-06
  await page.getByTestId("pnl-table").getByText("$5,940.00").first().click();
  await expect(page).toHaveURL(/\/transactions\?category=.+&month=2026-06/);
});

test("CSV export returns the accountant grid", async ({ page }) => {
  await seedYear();
  const res = await page.request.get("/api/reports/pnl/csv?year=2026");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.text();
  expect(body).toContain("Section,Category,1120-S line");
  expect(body).toContain("Client Revenue");
  expect(body).toContain("GROSS_RECEIPTS");
  expect(body).toContain("7940.00");
});

test("PDF export renders", async ({ page }) => {
  await seedYear();
  const res = await page.request.get("/api/reports/pnl/pdf?year=2026");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect((await res.body()).length).toBeGreaterThan(3000);
});
