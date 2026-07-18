import { test, expect } from "@playwright/test";
import { queryRows, resetDb } from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

async function seedFailure() {
  // A dead-lettered event (retries exhausted) with a FAILED handler run.
  // Payload is valid, so a manual Retry will succeed and clear it.
  await queryRows(
    `INSERT INTO "DomainEvent" (id, type, payload, "entityType", "entityId", "createdAt", attempts)
     VALUES ('evt_dead1', 'invoice.voided', '{"invoiceId":"inv_x","number":"INV-0999"}', 'invoice', 'inv_x', NOW() - interval '2 hours', 5)`
  );
  await queryRows(
    `INSERT INTO "HandlerRun" (id, "eventId", handler, status, error, "ranAt")
     VALUES ('run_fail1', 'evt_dead1', 'notify-owner', 'FAILED', 'boom: simulated failure', NOW() - interval '1 hour')`
  );
}

test("healthy system shows all-green health card", async ({ page }) => {
  const tick = await page.request.get("/api/events/tick");
  expect(tick.ok()).toBeTruthy();

  await page.goto("/dashboard");
  const card = page.getByTestId("health-card");
  await expect(card).toBeVisible();
  await expect(card.getByText("All systems go")).toBeVisible();
});

test("failures surface on dashboard and failures view; retry clears them", async ({
  page,
}) => {
  await seedFailure();

  await page.goto("/dashboard");
  const card = page.getByTestId("health-card");
  await expect(card.getByText(/1 failed run/)).toBeVisible();

  await page.goto("/activity?view=failures");
  await expect(page.getByTestId("dead-letters")).toBeVisible();
  await expect(page.getByText("boom: simulated failure")).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByTestId("no-failures")).toBeVisible({ timeout: 20_000 });

  const rows = await queryRows(
    `SELECT "processedAt" FROM "DomainEvent" WHERE id = 'evt_dead1'`
  );
  expect(rows[0].processedAt).not.toBeNull();
});

test("meta-alert notifies once per day about automation failures", async ({ page }) => {
  await seedFailure();

  const tick1 = await page.request.get("/api/events/tick");
  expect((await tick1.json()).detected.systemFailures).toBe(1);

  const notif = await queryRows(
    `SELECT title FROM "Notification" WHERE title LIKE 'System:%'`
  );
  expect(notif.length).toBe(1);

  const tick2 = await page.request.get("/api/events/tick");
  expect((await tick2.json()).detected.systemFailures).toBe(0);
});
