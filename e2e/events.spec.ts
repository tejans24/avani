import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { insertClient, insertInvoice, insertLineItem, resetDb } from "./utils/db";

const FAKE_EMAILS = join(__dirname, "..", ".fake-emails");

function fakeEmails(): { subject: string; to: string }[] {
  if (!existsSync(FAKE_EMAILS)) return [];
  return readdirSync(FAKE_EMAILS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(FAKE_EMAILS, f), "utf8")));
}

test.beforeEach(async () => {
  await resetDb();
  rmSync(FAKE_EMAILS, { recursive: true, force: true });
});

test("sending an invoice lands in the activity feed", async ({ page }) => {
  const client = await insertClient();
  const id = await insertInvoice(client.id, {
    status: "DRAFT",
    totalCents: 594000,
    issueDate: "2026-07-16",
    dueDate: "2026-08-07",
    number: "INV-0100",
  });
  await insertLineItem(id, {
    description: "Consulting Services: 06/14/26 – 06/20/26",
    quantity: 6,
    unitPriceCents: 9000,
    amountCents: 54000,
  });

  await page.goto(`/invoices/${id}`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Send invoice" }).click();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible({ timeout: 20_000 });

  // Force a deterministic dispatch (the post-action one is fire-and-forget).
  const tick = await page.request.get("/api/events/tick");
  expect(tick.ok()).toBeTruthy();

  await page.goto("/activity");
  await expect(page.getByText("Invoice sent")).toBeVisible();
  await expect(page.getByText(/INV-0100 to Acme Corp/)).toBeVisible();
});

test("overdue detection notifies the owner but never emails the client while off", async ({
  page,
}) => {
  const client = await insertClient();
  await insertInvoice(client.id, {
    status: "SENT",
    totalCents: 200000,
    issueDate: "2026-06-01",
    dueDate: "2026-07-01",
    number: "INV-0101",
  });

  const tick = await page.request.get("/api/events/tick?now=2026-07-10");
  expect(tick.ok()).toBeTruthy();
  const body = await tick.json();
  expect(body.detected.overdueInvoices).toBe(1);

  await page.goto("/activity");
  await expect(page.getByText("Overdue", { exact: true })).toBeVisible();
  await expect(page.getByText(/9 days past due/)).toBeVisible();

  const emails = fakeEmails();
  // Owner gets the action-tier email; the client reminder stays off by default.
  expect(emails.some((e) => e.subject.startsWith("Avani:"))).toBeTruthy();
  expect(emails.some((e) => e.subject.startsWith("Reminder:"))).toBeFalsy();

  // Second tick: detector must not duplicate the overdue event.
  const tick2 = await page.request.get("/api/events/tick?now=2026-07-11");
  expect((await tick2.json()).detected.overdueInvoices).toBe(0);
});

test("overdue reminder emails the client once enabled in settings", async ({ page }) => {
  await page.goto("/settings");
  // Click-and-verify in one retry loop: the first click can land before
  // hydration on a cold dev server, so re-click until the persisted state
  // survives a reload.
  await expect(async () => {
    const sw = page.getByTestId("toggle-overdue-emails");
    if ((await sw.getAttribute("aria-checked")) !== "true") {
      await sw.click();
      await page.waitForTimeout(750);
      await page.reload();
    }
    await expect(sw).toHaveAttribute("aria-checked", "true");
  }).toPass({ timeout: 30_000 });

  const client = await insertClient({ billingEmail: "ap@acme.example" });
  await insertInvoice(client.id, {
    status: "SENT",
    totalCents: 150000,
    issueDate: "2026-06-01",
    dueDate: "2026-07-05",
    number: "INV-0102",
  });

  const tick = await page.request.get("/api/events/tick?now=2026-07-12");
  expect(tick.ok()).toBeTruthy();

  const reminder = fakeEmails().find((e) => e.subject.startsWith("Reminder:"));
  expect(reminder).toBeTruthy();
  expect(reminder!.subject).toContain("INV-0102");
  expect(reminder!.to).toBe("ap@acme.example");

  await page.goto("/activity");
  await expect(page.getByText("Reminder sent")).toBeVisible();
});
