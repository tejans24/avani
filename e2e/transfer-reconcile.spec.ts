import { test, expect } from "@playwright/test";
import {
  resetDb,
  insertAccount,
  insertTransaction,
  getCategoryIdByName,
  queryRows,
} from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

/**
 * The no-double-count guarantee: a credit-card charge is the expense (counts in
 * P&L once); the bank payment that later settles the card is a TRANSFER, not a
 * second expense. Confirming the transfer books both legs as "Transfer Between
 * Accounts" so profit reflects only the charge.
 */
test("confirming a bank↔card transfer keeps it out of P&L (no double-count)", async ({ page }) => {
  const bank = await insertAccount({ name: "Mercury Checking", kind: "BANK" });
  const card = await insertAccount({ name: "Amex", kind: "CREDIT_CARD" });
  const revenue = await getCategoryIdByName("Client Revenue");
  const software = await getCategoryIdByName("Software & Subscriptions");
  const transferCat = await getCategoryIdByName("Transfer Between Accounts");

  // $1,000 revenue and a $49 card charge (the real expense).
  await insertTransaction(bank.id, {
    postedAt: "2026-06-01",
    amountCents: 100000,
    description: "ACME ACH",
    categoryId: revenue,
    status: "REVIEWED",
  });
  await insertTransaction(card.id, {
    postedAt: "2026-06-18",
    amountCents: -4900,
    description: "CURSOR AI SUBSCRIPTION",
    categoryId: software,
    status: "REVIEWED",
  });
  // The two legs of settling the card from the bank — both uncategorized.
  await insertTransaction(bank.id, {
    postedAt: "2026-06-21",
    amountCents: -4900,
    description: "AMEX EPAYMENT ACH PMT",
  });
  await insertTransaction(card.id, {
    postedAt: "2026-06-21",
    amountCents: 4900,
    description: "PAYMENT THANK YOU",
  });

  // The transfer is suggested on /transactions.
  await page.goto("/transactions");
  const strip = page.getByTestId("transfer-suggestion");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("$49.00");

  // Confirm it.
  await strip.getByRole("button", { name: "It's a transfer" }).click();
  await expect(page.getByTestId("transfer-suggestion")).toHaveCount(0, { timeout: 20_000 });

  // Both legs are now booked as Transfer, reviewed, and share a group id.
  const legs = await queryRows(
    `SELECT "categoryId", status, "transferGroupId" FROM "Transaction"
      WHERE description IN ('AMEX EPAYMENT ACH PMT', 'PAYMENT THANK YOU')
      ORDER BY description`
  );
  expect(legs).toHaveLength(2);
  for (const leg of legs) {
    expect(leg.categoryId).toBe(transferCat);
    expect(leg.status).toBe("REVIEWED");
  }
  expect(legs[0].transferGroupId).toBe(legs[1].transferGroupId);
  expect(legs[0].transferGroupId).toBeTruthy();

  // P&L: profit = $1,000 revenue − $49 charge = $951. The transfer contributes
  // $0 — it is NOT a second $49 expense, and the card credit is NOT $49 income.
  await page.goto("/reports/pnl?year=2026");
  await expect(page.getByTestId("net-profit")).toHaveText("$951.00");

  // The transfer shows below the net-profit line, not as income/expense.
  const table = page.getByTestId("pnl-table");
  await expect(table.getByText("Below the line (owner & transfers)")).toBeVisible();
});
