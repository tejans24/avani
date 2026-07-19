import { test, expect } from "@playwright/test";
import { insertClient, queryRows, resetDb } from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

/** Today (UTC) as YYYY-MM-DD. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

async function countEvents(type: string, clientId: string): Promise<number> {
  const rows = await queryRows(
    `SELECT count(*)::int AS n FROM "DomainEvent" WHERE type = $1 AND "entityId" = $2`,
    [type, clientId]
  );
  return rows[0].n as number;
}

test("a next action due today fires a follow-up nudge (once) and surfaces on the dashboard", async ({
  page,
}) => {
  const acme = await insertClient({
    name: "Acme Corp",
    billingEmail: "ap@acme.example",
    stage: "PROSPECT",
    nextActionNote: "Send the proposal",
    nextActionDueDate: todayIso(),
  });

  // Tick: detectors turn the due date into a client.followup_due event.
  const res = await page.request.get(`/api/events/tick?now=${todayIso()}`);
  expect(res.ok()).toBeTruthy();
  expect(await countEvents("client.followup_due", acme.id)).toBe(1);

  // A second tick is idempotent — no duplicate for the same due date.
  await page.request.get(`/api/events/tick?now=${todayIso()}`);
  expect(await countEvents("client.followup_due", acme.id)).toBe(1);

  // The dashboard "Needs you" list shows the follow-up.
  await page.goto("/dashboard");
  await expect(
    page.getByText("Follow up with Acme Corp: Send the proposal")
  ).toBeVisible();
});

test("a prospect with no contact past its cadence goes cold (once) and shows on the dashboard", async ({
  page,
}) => {
  const globex = await insertClient({
    name: "Globex Inc",
    billingEmail: "ap@globex.example",
    stage: "PROSPECT",
    // 30 days since the client was created, never contacted → past the
    // 7-day prospect cadence.
    createdAt: daysAgo(30),
  });

  const res = await page.request.get("/api/events/tick");
  expect(res.ok()).toBeTruthy();
  expect(await countEvents("client.going_cold", globex.id)).toBe(1);

  // Idempotent within the same cold spell.
  await page.request.get("/api/events/tick");
  expect(await countEvents("client.going_cold", globex.id)).toBe(1);

  await page.goto("/dashboard");
  await expect(page.getByText("Globex Inc is going cold")).toBeVisible();
});

test("an active client with a recent invoice-based cadence is not chased as going cold", async ({
  page,
}) => {
  const steady = await insertClient({
    name: "Steady Co",
    billingEmail: "ap@steady.example",
    stage: "ACTIVE",
    createdAt: daysAgo(90),
  });

  await page.request.get("/api/events/tick");
  expect(await countEvents("client.going_cold", steady.id)).toBe(0);
});
