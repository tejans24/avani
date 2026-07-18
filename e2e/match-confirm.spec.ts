import { test, expect } from "@playwright/test";
import {
  resetDb,
  insertClient,
  insertInvoice,
  insertAccount,
  insertTransaction,
  getCategoryIdByName,
  queryRows,
} from "./utils/db";

/** Seed a SENT invoice and a same-amount unmatched deposit posted after issue. */
async function seedMatchPair(number: string) {
  const client = await insertClient(); // Acme Corp
  const invoiceId = await insertInvoice(client.id, {
    status: "SENT",
    totalCents: 594000,
    issueDate: "2026-07-01",
    dueDate: "2026-08-15", // future relative to the real clock → badge stays "Sent"
    number,
  });
  const account = await insertAccount();
  const txnId = await insertTransaction(account.id, {
    postedAt: "2026-07-10",
    amountCents: 594000,
    description: "ACME ACH",
  });
  return { invoiceId, txnId };
}

test.describe("deposit→invoice matching", () => {
  test.beforeEach(async ({ page }) => {
    await resetDb();
    // The sandbox has no internet access, so the Google Fonts @import in
    // ds/tokens/fonts.css hangs — and React blocks transition commits (e.g.
    // applying a server action's revalidated tree) on pending stylesheet
    // loads. Abort font requests instantly so commits stay deterministic.
    await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  });

  test("confirm from the transactions page pays the invoice and links the deposit", async ({
    page,
  }) => {
    const { invoiceId, txnId } = await seedMatchPair("INV-0301");
    const revenueId = await getCategoryIdByName("Client Revenue");

    await page.goto("/transactions");
    const banner = page.getByText(/looks like Acme Corp's payment for INV-0301/);
    await expect(banner).toBeVisible();
    await expect(page.getByText(/strong match/)).toBeVisible();

    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(banner).toHaveCount(0, { timeout: 20_000 });

    // Invoice paid as of the deposit's posted date; deposit linked, booked as
    // Client Revenue, and reviewed.
    const inv = await queryRows(
      `SELECT status, to_char("paidAt", 'YYYY-MM-DD') AS paid FROM "Invoice" WHERE id = $1`,
      [invoiceId]
    );
    expect(inv[0].status).toBe("PAID");
    expect(inv[0].paid).toBe("2026-07-10");
    const txn = await queryRows(
      `SELECT "matchedInvoiceId", "categoryId", status FROM "Transaction" WHERE id = $1`,
      [txnId]
    );
    expect(txn[0].matchedInvoiceId).toBe(invoiceId);
    expect(txn[0].categoryId).toBe(revenueId);
    expect(txn[0].status).toBe("REVIEWED");

    await page.goto(`/invoices/${invoiceId}`);
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();

    // Both facts landed in the activity feed (events are written in the same
    // db transaction as the confirm, so no tick is needed to see them).
    await page.goto("/activity");
    await expect(page.getByText("Matched", { exact: true })).toBeVisible();
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  });

  test("reverse suggestion on the invoice detail page confirms the payment", async ({
    page,
  }) => {
    const { invoiceId } = await seedMatchPair("INV-0302");

    await page.goto(`/invoices/${invoiceId}`);
    await expect(
      page.getByText(/A \$5,940\.00 deposit on Jul 10, 2026 looks like this payment/)
    ).toBeVisible();

    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText("Paid", { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test("unlink returns the invoice to SENT and frees the deposit", async ({ page }) => {
    const { invoiceId, txnId } = await seedMatchPair("INV-0303");

    // Confirm through the UI first.
    await page.goto(`/invoices/${invoiceId}`);
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText("Paid", { exact: true })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Unlink payment" }).click();
    await expect(page.getByText("Sent", { exact: true })).toBeVisible({ timeout: 20_000 });

    const inv = await queryRows(
      `SELECT status, "paidAt" FROM "Invoice" WHERE id = $1`,
      [invoiceId]
    );
    expect(inv[0].status).toBe("SENT");
    expect(inv[0].paidAt).toBeNull();
    const txn = await queryRows(
      `SELECT "matchedInvoiceId", status FROM "Transaction" WHERE id = $1`,
      [txnId]
    );
    expect(txn[0].matchedInvoiceId).toBeNull();
    // Category/review status are kept on unlink — only the linkage was wrong.
    expect(txn[0].status).toBe("REVIEWED");
  });

  test("payment.missing fires once for overdue-plus-grace invoices with no deposit", async ({
    page,
  }) => {
    const client = await insertClient();
    await insertInvoice(client.id, {
      status: "SENT",
      totalCents: 250000,
      issueDate: "2026-06-20",
      dueDate: "2026-07-08", // 10 days before the simulated "now"
      number: "INV-0304",
    });

    const tick = await page.request.get("/api/events/tick?now=2026-07-18");
    expect(tick.ok()).toBeTruthy();
    expect((await tick.json()).detected.missingPayments).toBe(1);

    await page.goto("/activity");
    await expect(page.getByText("Payment missing", { exact: true })).toBeVisible();

    // Idempotent: a second tick emits nothing new.
    const tick2 = await page.request.get("/api/events/tick?now=2026-07-19");
    expect((await tick2.json()).detected.missingPayments).toBe(0);
  });
});
