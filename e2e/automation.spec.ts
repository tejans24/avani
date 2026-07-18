import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  insertAccount,
  insertInvoice,
  insertLineItem,
  insertTransaction,
  queryRows,
  resetDb,
} from "./utils/db";

const FAKE_EMAILS = join(__dirname, "..", ".fake-emails");

function fakeEmails(): { subject: string; to: string }[] {
  if (!existsSync(FAKE_EMAILS)) return [];
  return readdirSync(FAKE_EMAILS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(FAKE_EMAILS, f), "utf8")));
}

/** "YYYY-MM-DD" for today + n days (UTC). */
function isoFromToday(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe("automation", () => {
  test.beforeEach(async ({ page }) => {
    await resetDb();
    rmSync(FAKE_EMAILS, { recursive: true, force: true });
    await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
  });

  test("biweekly cadence prepares the next draft from the latest invoice", async ({
    page,
  }) => {
    // Create the client through the form — also verifies the new cadence field.
    await page.goto("/clients/new");
    await page.locator("#name").fill("Cadence Co");
    await page.locator("#billingEmail").fill("billing@cadence.example");
    await page.locator("#billingCadenceDays").selectOption("14");
    await page.getByRole("button", { name: "Create client" }).click();
    await page.waitForURL("**/clients");

    const clients = await queryRows(
      `SELECT id, "billingCadenceDays" FROM "Client" WHERE name = 'Cadence Co'`
    );
    expect(clients).toHaveLength(1);
    expect(clients[0].billingCadenceDays).toBe(14);
    const clientId = clients[0].id as string;

    // Latest invoice: SENT, issued 20 days ago (due in 5 — not overdue).
    const sourceId = await insertInvoice(clientId, {
      status: "SENT",
      totalCents: 54_000,
      issueDate: isoFromToday(-20),
      dueDate: isoFromToday(5),
      number: "INV-0100",
    });
    await insertLineItem(sourceId, {
      description: "Consulting Services: 06/14/26 – 06/20/26",
      quantity: 6,
      unitPriceCents: 9_000,
      amountCents: 54_000,
    });

    const today = isoFromToday(0);
    const tick = await page.request.get(`/api/events/tick?now=${today}`);
    expect(tick.ok()).toBeTruthy();
    expect((await tick.json()).detected.dueDrafts).toBe(1);

    // The draft exists with the next allocated number.
    await page.goto("/invoices");
    const draftRow = page.locator(".data-table tbody tr", { hasText: "INV-0001" });
    await expect(draftRow).toBeVisible();
    await expect(draftRow).toContainText("Draft");
    await expect(draftRow).toContainText("Cadence Co");

    // Line-item period dates shifted by the 14-day cadence.
    const items = await queryRows(
      `SELECT li.description
         FROM "InvoiceLineItem" li
         JOIN "Invoice" i ON i.id = li."invoiceId"
        WHERE i.status = 'DRAFT' AND i."clientId" = $1`,
      [clientId]
    );
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Consulting Services: 06/28/26 – 07/04/26");

    await page.goto("/activity");
    await expect(page.getByText("Draft prepared").first()).toBeVisible();

    // Action-tier owner email announced the draft.
    const email = fakeEmails().find(
      (e) => e.subject.startsWith("Avani:") && e.subject.includes("Draft INV-0001")
    );
    expect(email).toBeTruthy();
    expect(email!.to).toBe("owner@example.com");

    // Second tick: the pending draft blocks another one.
    const tick2 = await page.request.get(`/api/events/tick?now=${today}`);
    expect((await tick2.json()).detected.dueDrafts).toBe(0);
  });

  test("compliance window opens once and the 1120-S package shows blockers", async ({
    page,
  }) => {
    const dueIso = isoFromToday(20); // inside a 30-day lead window
    const pkgYear = Number(dueIso.slice(0, 4)) - 1;
    await queryRows(
      `INSERT INTO "ComplianceDeadline" (id, key, title, "dueDate", "leadDays", enabled, notes)
       VALUES ('testddl_1120s', 'form-1120s-test', $1, $2, 30, true, NULL)`,
      [`Form 1120-S (S-corp return) for ${pkgYear}`, dueIso]
    );

    // One uncategorized (and unreviewed) transaction this year -> blockers.
    const acct = await insertAccount();
    await insertTransaction(acct.id, {
      postedAt: isoFromToday(-10),
      amountCents: -5_000,
      description: "Mystery charge",
    });

    const today = isoFromToday(0);
    const tick = await page.request.get(`/api/events/tick?now=${today}`);
    expect(tick.ok()).toBeTruthy();
    expect((await tick.json()).detected.complianceWindows).toBe(1);

    // Idempotent: the window only opens once per deadline key.
    const tick2 = await page.request.get(`/api/events/tick?now=${today}`);
    expect((await tick2.json()).detected.complianceWindows).toBe(0);

    await page.goto("/activity");
    await expect(page.getByText("Compliance").first()).toBeVisible();
    await expect(
      page.getByText(`Form 1120-S (S-corp return) for ${pkgYear}`).first()
    ).toBeVisible();

    // The taxes page shows the accountant-package block with blockers.
    await page.goto("/reports/taxes");
    const pkg = page.getByTestId("package-block");
    await expect(pkg).toBeVisible();

    const csvLink = pkg.getByRole("link", { name: `P&L CSV (${pkgYear})` });
    await expect(csvLink).toHaveAttribute(
      "href",
      `/api/reports/pnl/csv?year=${pkgYear}`
    );
    await expect(
      pkg.getByRole("link", { name: `P&L PDF (${pkgYear})` })
    ).toHaveAttribute("href", `/api/reports/pnl/pdf?year=${pkgYear}`);

    const uncatLink = pkg.getByRole("link", { name: "1 uncategorized transaction" });
    await expect(uncatLink).toHaveAttribute("href", "/transactions?category=none");
    await expect(pkg.getByRole("link", { name: "1 unreviewed" })).toHaveAttribute(
      "href",
      "/transactions?status=unreviewed"
    );
    await expect(pkg).toContainText("Officer compensation $0.00 vs distributions $0.00");
  });
});
