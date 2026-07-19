import { test, expect } from "@playwright/test";
import { insertClient, queryRows, resetDb } from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

/** Add n calendar days to today (UTC), returned as YYYY-MM-DD. */
function todayPlusCalendarDays(n: number): string {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() + n);
  return utc.toISOString().slice(0, 10);
}

test("client payment terms persist through the form", async ({ page }) => {
  await page.goto("/clients/new");
  await page.locator("#name").fill("Net Thirty Co");
  await page.locator("#billingEmail").fill("ap@net30.example");
  await page.locator("#netDays").fill("30");
  await page.locator("#netDaysMode").selectOption("CALENDAR");
  await page.getByRole("button", { name: "Create client" }).click();
  await page.waitForURL("**/clients");

  const rows = await queryRows(
    `SELECT "netDays", "netDaysMode" FROM "Client" WHERE name = 'Net Thirty Co'`
  );
  expect(rows[0].netDays).toBe(30);
  expect(rows[0].netDaysMode).toBe("CALENDAR");
});

test("new invoice defaults the due date to the selected client's terms", async ({ page }) => {
  // Company default is 15 business days (seed); this client overrides to 45 calendar.
  const client = await insertClient({
    name: "Net Forty-Five",
    billingEmail: "ap@n45.example",
    netDays: 45,
    netDaysMode: "CALENDAR",
  });

  await page.goto(`/invoices/new?client=${client.id}`);
  // Due date should reflect today + 45 calendar days.
  await expect(page.locator("#dueDate")).toHaveValue(todayPlusCalendarDays(45));

  // Switching to a client with no override falls back to the company default,
  // which is business-day based → a different (earlier) due date.
  const plain = await insertClient({ name: "Default Terms Co", billingEmail: "ap@dt.example" });
  await page.reload();
  await page.goto(`/invoices/new?client=${plain.id}`);
  await expect(page.locator("#dueDate")).not.toHaveValue(todayPlusCalendarDays(45));
});
