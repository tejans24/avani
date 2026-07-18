import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { getCategoryIdByName, insertAccount, queryRows, resetDb } from "./utils/db";

const FIXTURE = path.join(__dirname, "fixtures", "amex-sample.csv");
// amex-sample.csv: 10 data rows (all valid), charges positive, one -750.00 payment.
const FIXTURE_ROWS = 10;

async function insertAmexAccount() {
  return insertAccount({
    name: "Amex Gold",
    kind: "CREDIT_CARD",
    institution: "American Express",
    mask: "1005",
    amountsAreCharges: true,
  });
}

/** Drive the wizard end-to-end for the fixture file; lands on the success state. */
async function runImportFlow(page: Page, accountId: string) {
  await page.goto(`/accounts/${accountId}/import`);
  await page.locator("#csv-file").setInputFiles(FIXTURE);
  await page.getByRole("button", { name: "Continue to preview" }).click();
  await page.getByRole("button", { name: /Import \d+ transactions?/ }).click();
  await expect(page.getByText(/Imported \d+ transactions?/)).toBeVisible();
}

test.describe("csv import", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("creates an account via the form", async ({ page }) => {
    await page.goto("/accounts/new");
    await expect(page.getByRole("heading", { name: "New account" })).toBeVisible();

    await page.locator("#name").fill("Amex Gold");
    await page.locator("#kind").selectOption("CREDIT_CARD");
    await page.locator("#institution").fill("American Express");
    await page.locator("#mask").fill("1005");

    // Picking Credit card defaults "amounts are charges" on.
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Create account" }).click();

    await page.waitForURL("**/accounts");
    const row = page.locator(".data-table tbody tr", { hasText: "Amex Gold" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("American Express");
    await expect(row).toContainText("Credit card");
    await expect(row).toContainText("•••• 1005");
    await expect(row).toContainText("CSV");
  });

  test("imports the amex fixture through the wizard", async ({ page }) => {
    const account = await insertAmexAccount();

    await page.goto(`/accounts/${account.id}/import`);
    await page.locator("#csv-file").setInputFiles(FIXTURE);

    // Columns auto-detected from the Amex header (Date=0, Description=1, Amount=4)
    // and the header checkbox defaults on.
    await expect(page.locator("#col-date")).toHaveValue("0");
    await expect(page.locator("#col-description")).toHaveValue("1");
    await expect(page.locator("#col-amount")).toHaveValue("4");
    await expect(page.locator("#skip-first-row")).toBeChecked();
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Continue to preview" }).click();

    // Charges flip negative (money out), the payment flips positive (money in).
    const chargeRow = page.locator(".data-table tbody tr", { hasText: "CURSOR" });
    await expect(chargeRow.locator("td.num")).toHaveText("-$20.00");
    const paymentRow = page.locator(".data-table tbody tr", {
      hasText: "ONLINE PAYMENT",
    });
    await expect(paymentRow.locator("td.num")).toHaveText("$750.00");

    await expect(page.getByTestId("import-summary")).toHaveText(
      `${FIXTURE_ROWS} of ${FIXTURE_ROWS} rows will import.`
    );

    await page.getByRole("button", { name: `Import ${FIXTURE_ROWS} transactions` }).click();
    await expect(
      page.getByText(`Imported ${FIXTURE_ROWS} transactions, skipped 0 duplicates.`)
    ).toBeVisible();

    const counts = await queryRows(
      `SELECT COUNT(*)::int AS count FROM "Transaction" WHERE "accountId" = $1`,
      [account.id]
    );
    expect(counts[0].count).toBe(FIXTURE_ROWS);

    // Known amount, sign-flipped: the 20.00 Cursor charge stores as -2000.
    const cursor = await queryRows(
      `SELECT "amountCents" FROM "Transaction"
       WHERE "accountId" = $1 AND description LIKE 'CURSOR%'`,
      [account.id]
    );
    expect(cursor).toHaveLength(1);
    expect(cursor[0].amountCents).toBe(-2000);

    // Both identical same-day Blue Bottle charges import (ordinal dedupe keys).
    const blueBottle = await queryRows(
      `SELECT "amountCents" FROM "Transaction"
       WHERE "accountId" = $1 AND description LIKE 'BLUE BOTTLE%'`,
      [account.id]
    );
    expect(blueBottle).toHaveLength(2);
  });

  test("re-importing the same file skips every row", async ({ page }) => {
    const account = await insertAmexAccount();

    await runImportFlow(page, account.id);
    await expect(
      page.getByText(`Imported ${FIXTURE_ROWS} transactions, skipped 0 duplicates.`)
    ).toBeVisible();

    await runImportFlow(page, account.id);
    await expect(
      page.getByText(`Imported 0 transactions, skipped ${FIXTURE_ROWS} duplicates.`)
    ).toBeVisible();

    const counts = await queryRows(
      `SELECT COUNT(*)::int AS count FROM "Transaction" WHERE "accountId" = $1`,
      [account.id]
    );
    expect(counts[0].count).toBe(FIXTURE_ROWS);
  });

  test("applies category rules during import", async ({ page }) => {
    const account = await insertAmexAccount();
    const categoryId = await getCategoryIdByName("Software & Subscriptions");
    await queryRows(
      `INSERT INTO "CategoryRule" (id, field, "matchType", pattern, "categoryId", priority, "createdAt")
       VALUES ('testrule_cursor', 'DESCRIPTION'::"RuleField", 'SUBSTRING'::"RuleMatchType", 'CURSOR', $1, 100, NOW())`,
      [categoryId]
    );

    await runImportFlow(page, account.id);

    const rows = await queryRows(
      `SELECT "categoryId" FROM "Transaction"
       WHERE "accountId" = $1 AND description LIKE 'CURSOR%'`,
      [account.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryId).toBe(categoryId);
  });
});
