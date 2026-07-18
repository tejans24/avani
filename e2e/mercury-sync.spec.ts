import { test, expect } from "@playwright/test";
import { getCategoryIdByName, queryRows, resetDb } from "./utils/db";

// Fixture facts (e2e/fixtures/mercury/transactions-merc_check_1.json):
// 4 "sent" transactions import; 1 pending + 1 cancelled are skipped entirely.
const SENT_COUNT = 4;

test.beforeEach(async () => {
  await resetDb();
});

test("first sync upserts the account and imports only settled transactions", async ({
  page,
}) => {
  const res = await page.request.post("/api/sync/mercury");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({
    ok: true,
    accountsUpserted: 1,
    imported: SENT_COUNT,
    skipped: 0,
  });

  const accounts = await queryRows(
    `SELECT * FROM "FinancialAccount" WHERE "mercuryAccountId" = 'merc_check_1'`
  );
  expect(accounts).toHaveLength(1);
  expect(accounts[0].name).toBe("Mercury Checking");
  expect(accounts[0].source).toBe("MERCURY_API");
  expect(accounts[0].institution).toBe("Mercury");
  expect(accounts[0].mask).toBe("7890");
  expect(accounts[0].kind).toBe("BANK");

  const txns = await queryRows(
    `SELECT description, merchant, "amountCents", "dedupeKey" FROM "Transaction"`
  );
  expect(txns).toHaveLength(SENT_COUNT);

  // The client deposit came through as +594000 signed cents.
  const deposit = txns.find((t) => t.amountCents === 594000);
  expect(deposit).toBeTruthy();
  expect(deposit!.description).toBe("ACME CORP ACH PAYMENT");
  expect(deposit!.merchant).toBe("ACME CORP");
  expect(deposit!.dedupeKey).toBe("mercury:merc_txn_001");

  // Debits keep their negative sign (business perspective, no flip).
  expect(txns.some((t) => t.amountCents === -12055)).toBeTruthy();

  // Pending and cancelled fixture rows must NOT import.
  const descriptions = txns.map((t) => t.description);
  expect(descriptions).not.toContain("PENDING WIRE OFFICE RENT");
  expect(descriptions).not.toContain("CANCELLED VENDOR PAYMENT");
});

test("second sync is idempotent — nothing re-imports", async ({ page }) => {
  const first = await page.request.post("/api/sync/mercury");
  expect(first.status()).toBe(200);
  expect(await first.json()).toMatchObject({
    ok: true,
    imported: SENT_COUNT,
    skipped: 0,
  });

  const second = await page.request.post("/api/sync/mercury");
  expect(second.status()).toBe(200);
  expect(await second.json()).toMatchObject({
    ok: true,
    accountsUpserted: 1,
    imported: 0,
    skipped: SENT_COUNT,
  });

  const [{ count }] = await queryRows(`SELECT COUNT(*)::int AS count FROM "Transaction"`);
  expect(count).toBe(SENT_COUNT);
});

test("category rules apply at import time", async ({ page }) => {
  const categoryId = await getCategoryIdByName("Software & Subscriptions");
  await queryRows(
    `INSERT INTO "CategoryRule" (id, field, "matchType", pattern, "categoryId", priority, "createdAt")
     VALUES ('testrule_cursor', 'DESCRIPTION'::"RuleField", 'SUBSTRING'::"RuleMatchType", 'CURSOR', $1, 100, NOW())`,
    [categoryId]
  );

  const res = await page.request.post("/api/sync/mercury");
  expect(res.status()).toBe(200);

  const rows = await queryRows(
    `SELECT "categoryId" FROM "Transaction" WHERE description = 'CURSOR AI SUBSCRIPTION'`
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].categoryId).toBe(categoryId);

  // Unmatched transactions stay uncategorized.
  const uncategorized = await queryRows(
    `SELECT "categoryId" FROM "Transaction" WHERE description = 'GUSTO PAYROLL FEE'`
  );
  expect(uncategorized[0].categoryId).toBeNull();
});

test("the activity feed shows the import", async ({ page }) => {
  const res = await page.request.post("/api/sync/mercury");
  expect(res.status()).toBe(200);

  await page.goto("/activity");
  await expect(page.getByText("Imported", { exact: true })).toBeVisible();
  await expect(
    page.getByText(`${SENT_COUNT} into Mercury Checking (0 duplicates skipped)`)
  ).toBeVisible();
});
