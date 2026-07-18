import { test, expect } from "@playwright/test";
import { insertClient, insertInvoice, resetDb } from "./utils/db";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

const now = new Date();
// Mid-month two calendar months ago (UTC) — avoids month-end rollover surprises.
const twoMonthsAgo = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 15)
);
// The $1,000 payment falls outside YTD when "two months ago" crosses a year boundary.
const expectedYtdCents =
  twoMonthsAgo.getUTCFullYear() === now.getUTCFullYear() ? 694_000 : 594_000;
const expectedYtd = (expectedYtdCents / 100).toLocaleString("en-US", {
  style: "currency",
  currency: "USD",
});

test.describe("reports", () => {
  test.beforeAll(async () => {
    await resetDb();
    const client = await insertClient({ name: "Acme Corp" });

    // PAID $5,940.00, paid this month.
    await insertInvoice(client.id, {
      status: "PAID",
      totalCents: 594_000,
      issueDate: iso(daysFromNow(-20)),
      dueDate: iso(daysFromNow(-5)),
      paidAt: now,
      number: "INV-9001",
    });
    // PAID $1,000.00, paid two months ago.
    await insertInvoice(client.id, {
      status: "PAID",
      totalCents: 100_000,
      issueDate: iso(new Date(twoMonthsAgo.getTime() - 10 * 86_400_000)),
      dueDate: iso(twoMonthsAgo),
      paidAt: twoMonthsAgo,
      number: "INV-9002",
    });
    // SENT $2,000.00, due in the future.
    await insertInvoice(client.id, {
      status: "SENT",
      totalCents: 200_000,
      issueDate: iso(now),
      dueDate: iso(daysFromNow(30)),
      number: "INV-9003",
    });
    // SENT $500.00, due last week (overdue).
    await insertInvoice(client.id, {
      status: "SENT",
      totalCents: 50_000,
      issueDate: iso(daysFromNow(-21)),
      dueDate: iso(daysFromNow(-7)),
      number: "INV-9004",
    });
  });

  test("shows aggregate tiles, revenue chart, and top client", async ({ page }) => {
    await page.goto("/reports");

    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

    // Stat tiles. Exact match so "$500.00" doesn't also hit "$2,500.00".
    await expect(page.getByText("$2,500.00", { exact: true })).toBeVisible(); // Outstanding
    await expect(page.getByText("$500.00", { exact: true })).toBeVisible(); // Overdue
    await expect(page.getByText(expectedYtd, { exact: true })).toBeVisible(); // Collected YTD

    // Revenue chart section.
    await expect(page.getByRole("heading", { name: "Revenue by month" })).toBeVisible();

    // Top clients section shows the client name (rendered as a chart axis label).
    // Scoped to main: recharts keeps an off-screen measurement span with the same text.
    await expect(page.getByRole("heading", { name: "Top clients" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Acme Corp")).toBeVisible();
  });
});
