import { test, expect } from "@playwright/test";
import {
  resetDb,
  insertAccount,
  insertTransaction,
  getCategoryIdByName,
  queryRows,
} from "./utils/db";

const rowsLocator = (page) => page.locator(".data-table tbody tr");

test.describe("transactions", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("filters by account, month, status tab, and search", async ({ page }) => {
    const checking = await insertAccount({ name: "Mercury Checking" });
    const amex = await insertAccount({ name: "Amex Card" });
    await insertTransaction(checking.id, {
      postedAt: "2026-06-05",
      amountCents: -1000,
      description: "CURSOR AI SUBSCRIPTION",
    });
    await insertTransaction(checking.id, {
      postedAt: "2026-07-02",
      amountCents: 500000,
      description: "STRIPE PAYOUT ACME",
    });
    await insertTransaction(amex.id, {
      postedAt: "2026-06-20",
      amountCents: -4200,
      description: "AWS BILL",
    });
    await insertTransaction(amex.id, {
      postedAt: "2026-07-03",
      amountCents: -2500,
      description: "UBER TRIP",
      status: "EXCLUDED",
    });

    await page.goto("/transactions");
    await expect(rowsLocator(page)).toHaveCount(4);

    // Account filter narrows to the Amex transactions.
    await page.getByLabel("Filter by account").selectOption({ label: "Amex Card" });
    await expect(rowsLocator(page)).toHaveCount(2);
    await expect(page.getByText("AWS BILL")).toBeVisible();
    await expect(page.getByText("STRIPE PAYOUT ACME")).toHaveCount(0);

    // Back to all accounts, then month filter narrows to June.
    await page.getByLabel("Filter by account").selectOption({ label: "All accounts" });
    await expect(rowsLocator(page)).toHaveCount(4);
    await page.getByLabel("Filter by month").fill("2026-06");
    await expect(rowsLocator(page)).toHaveCount(2);
    await expect(page.getByText("CURSOR AI SUBSCRIPTION")).toBeVisible();
    await expect(page.getByText("UBER TRIP")).toHaveCount(0);

    // Clear month, then the Excluded status tab shows only the excluded txn.
    await page.getByLabel("Filter by month").fill("");
    await expect(rowsLocator(page)).toHaveCount(4);
    await page.locator(".filter-tabs").getByRole("link", { name: "Excluded" }).click();
    await expect(rowsLocator(page)).toHaveCount(1);
    await expect(page.getByText("UBER TRIP")).toBeVisible();

    // Back to All, then search narrows by description substring.
    await page.locator(".filter-tabs").getByRole("link", { name: "All" }).click();
    await expect(rowsLocator(page)).toHaveCount(4);
    await page.getByLabel("Search transactions").fill("cursor");
    await expect(rowsLocator(page)).toHaveCount(1);
    await expect(page.getByText("CURSOR AI SUBSCRIPTION")).toBeVisible();
  });

  test("inline categorize flips an unreviewed txn to reviewed", async ({ page }) => {
    const acct = await insertAccount({ name: "Mercury Checking" });
    const txnId = await insertTransaction(acct.id, {
      postedAt: "2026-07-01",
      amountCents: -1000,
      description: "GITHUB SUBSCRIPTION",
    });
    const softwareId = await getCategoryIdByName("Software & Subscriptions");

    await page.goto("/transactions");
    const row = page.locator(".data-table tbody tr", { hasText: "GITHUB SUBSCRIPTION" });
    await expect(row.getByText("Unreviewed", { exact: true })).toBeVisible();

    await row
      .getByLabel("Category for GITHUB SUBSCRIPTION")
      .selectOption({ label: "Software & Subscriptions" });

    await expect(row.getByText("Reviewed", { exact: true })).toBeVisible();
    await expect(row.getByLabel("Category for GITHUB SUBSCRIPTION")).toHaveValue(softwareId);

    const dbRows = await queryRows(
      `SELECT "categoryId", status FROM "Transaction" WHERE id = $1`,
      [txnId]
    );
    expect(dbRows[0].categoryId).toBe(softwareId);
    expect(dbRows[0].status).toBe("REVIEWED");
  });

  test("creates a rule from a categorize and applies it to existing uncategorized only", async ({
    page,
  }) => {
    const acct = await insertAccount({ name: "Mercury Checking" });
    const mealsId = await getCategoryIdByName("Meals (50%)");
    const softwareId = await getCategoryIdByName("Software & Subscriptions");

    const t1 = await insertTransaction(acct.id, {
      postedAt: "2026-06-05",
      amountCents: -2000,
      description: "Cursor June",
      merchant: "CURSOR AI SUBSCRIPTION",
    });
    // Second uncategorized CURSOR txn — should be picked up by the rule.
    const t2 = await insertTransaction(acct.id, {
      postedAt: "2026-07-05",
      amountCents: -2000,
      description: "Cursor July",
      merchant: "CURSOR AI SUBSCRIPTION",
    });
    // Already categorized to something else — must NOT be overwritten.
    const t3 = await insertTransaction(acct.id, {
      postedAt: "2026-05-05",
      amountCents: -2000,
      description: "Cursor May",
      merchant: "CURSOR AI SUBSCRIPTION",
      categoryId: mealsId,
      status: "REVIEWED",
    });

    await page.goto("/transactions");
    await page
      .getByLabel("Category for Cursor June")
      .selectOption({ label: "Software & Subscriptions" });

    // Rule strip appears with the merchant prefilled; keep the pattern as-is.
    await expect(page.getByText("Create rule from this?")).toBeVisible();
    await expect(page.getByLabel("Rule pattern")).toHaveValue("CURSOR AI SUBSCRIPTION");
    await expect(
      page.getByRole("checkbox", { name: /Also apply to \d+ existing uncategorized/ })
    ).toBeChecked();

    await page.getByRole("button", { name: "Create rule" }).click();
    await expect(page.getByText("Create rule from this?")).toHaveCount(0);

    // t2 got the category from the rule but stays UNREVIEWED (owner still reviews).
    await expect
      .poll(async () => {
        const rows = await queryRows(
          `SELECT "categoryId" FROM "Transaction" WHERE id = $1`,
          [t2]
        );
        return rows[0].categoryId;
      })
      .toBe(softwareId);
    const t2Rows = await queryRows(`SELECT status FROM "Transaction" WHERE id = $1`, [t2]);
    expect(t2Rows[0].status).toBe("UNREVIEWED");

    // t1 was categorized by hand; t3's human categorization is untouched.
    const t1Rows = await queryRows(
      `SELECT "categoryId" FROM "Transaction" WHERE id = $1`,
      [t1]
    );
    expect(t1Rows[0].categoryId).toBe(softwareId);
    const t3Rows = await queryRows(
      `SELECT "categoryId" FROM "Transaction" WHERE id = $1`,
      [t3]
    );
    expect(t3Rows[0].categoryId).toBe(mealsId);

    const rules = await queryRows(
      `SELECT field, "matchType", pattern, "categoryId" FROM "CategoryRule"`
    );
    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toBe("CURSOR AI SUBSCRIPTION");
    expect(rules[0].field).toBe("MERCHANT");
    expect(rules[0].categoryId).toBe(softwareId);
  });

  test("bulk mark reviewed", async ({ page }) => {
    const acct = await insertAccount({ name: "Mercury Checking" });
    await insertTransaction(acct.id, {
      postedAt: "2026-07-01",
      amountCents: -1500,
      description: "ZOOM MONTHLY",
    });
    await insertTransaction(acct.id, {
      postedAt: "2026-07-02",
      amountCents: -800,
      description: "SLACK MONTHLY",
    });

    await page.goto("/transactions");
    await page.getByRole("checkbox", { name: "Select ZOOM MONTHLY" }).check();
    await page.getByRole("checkbox", { name: "Select SLACK MONTHLY" }).check();
    await expect(page.getByText("2 selected")).toBeVisible();

    await page.getByRole("button", { name: "Mark reviewed" }).click();

    const zoomRow = page.locator(".data-table tbody tr", { hasText: "ZOOM MONTHLY" });
    const slackRow = page.locator(".data-table tbody tr", { hasText: "SLACK MONTHLY" });
    await expect(zoomRow.getByText("Reviewed", { exact: true })).toBeVisible();
    await expect(slackRow.getByText("Reviewed", { exact: true })).toBeVisible();
    // Selection cleared after the bulk action.
    await expect(page.getByText("2 selected")).toHaveCount(0);
  });

  test("unreviewed pill shows the count and links to the filtered view", async ({
    page,
  }) => {
    const acct = await insertAccount({ name: "Mercury Checking" });
    await insertTransaction(acct.id, {
      postedAt: "2026-07-01",
      amountCents: -1000,
      description: "FIGMA",
    });
    await insertTransaction(acct.id, {
      postedAt: "2026-07-02",
      amountCents: -2000,
      description: "VERCEL",
    });
    await insertTransaction(acct.id, {
      postedAt: "2026-07-03",
      amountCents: -3000,
      description: "NOTION",
      status: "REVIEWED",
    });

    await page.goto("/transactions");
    await expect(rowsLocator(page)).toHaveCount(3);

    const pill = page.getByRole("link", { name: "2 unreviewed" });
    await expect(pill).toBeVisible();
    await pill.click();

    await expect(page).toHaveURL(/\/transactions\?status=unreviewed$/);
    await expect(rowsLocator(page)).toHaveCount(2);
    await expect(page.getByText("NOTION")).toHaveCount(0);
  });
});
