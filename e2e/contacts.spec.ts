import { test, expect } from "@playwright/test";
import { insertClient, queryRows, resetDb } from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

test("map an org: add contacts with role + reporting line, then edit and archive", async ({
  page,
}) => {
  const acme = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });

  // People tab starts empty.
  await page.goto(`/clients/${acme.id}?tab=people`);
  await expect(page.getByText("No contacts mapped yet")).toBeVisible();

  // Add the decision-maker at the top of the org.
  await page.getByRole("link", { name: "Add the first contact" }).click();
  await page.waitForURL(`**/clients/${acme.id}/contacts/new`);
  await page.locator("#name").fill("Dana Lee");
  await page.locator("#title").fill("VP Engineering");
  await page.locator("#role").selectOption("DECISION_MAKER");
  await page.getByRole("button", { name: "Add contact" }).click();

  await page.waitForURL(`**/clients/${acme.id}?tab=people`);
  await expect(page.getByTestId("contact-card").filter({ hasText: "Dana Lee" })).toBeVisible();
  await expect(page.getByText("Decision-maker")).toBeVisible();

  // Add a report who reports to Dana.
  await page.getByRole("link", { name: "Add contact" }).click();
  await page.waitForURL(`**/clients/${acme.id}/contacts/new`);
  await page.locator("#name").fill("Sam Rivera");
  await page.locator("#title").fill("Staff Engineer");
  await page.locator("#role").selectOption("CHAMPION");
  await page.locator("#reportsToId").selectOption({ label: "Dana Lee — VP Engineering" });
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.waitForURL(`**/clients/${acme.id}?tab=people`);

  // Both cards render; the org edge persisted in the DB.
  await expect(page.getByTestId("contact-card").filter({ hasText: "Sam Rivera" })).toBeVisible();
  const edge = await queryRows(
    `SELECT m.name AS manager FROM "Contact" c
       JOIN "Contact" m ON m.id = c."reportsToId"
      WHERE c.name = 'Sam Rivera'`
  );
  expect(edge[0]?.manager).toBe("Dana Lee");

  // The People tab is badged with the contact count (2).
  await expect(page.getByRole("link", { name: "People (2)" })).toBeVisible();

  // Edit Sam's title.
  await page
    .getByTestId("contact-card")
    .filter({ hasText: "Sam Rivera" })
    .getByRole("link", { name: "Edit" })
    .click();
  await page.waitForURL(`**/contacts/**/edit`);
  await page.locator("#title").fill("Principal Engineer");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`**/clients/${acme.id}?tab=people`);
  await expect(page.getByText("Principal Engineer")).toBeVisible();

  // Archive Sam → the card disappears and the count drops to 1.
  await page
    .getByTestId("contact-card")
    .filter({ hasText: "Sam Rivera" })
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(page.getByTestId("contact-card").filter({ hasText: "Sam Rivera" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "People (1)" })).toBeVisible();
});

test("contact notes are internal — a private note never leaks to the client invoice page", async ({
  page,
}) => {
  // Guard lives fully in crm-privacy.spec; this is a fast smoke that the notes
  // field saves and shows on the People tab (internal surface).
  const acme = await insertClient({ name: "Acme Corp", billingEmail: "ap@acme.example" });
  await page.goto(`/clients/${acme.id}/contacts/new`);
  await page.locator("#name").fill("Dana Lee");
  await page.locator("#notes").fill("Skeptical of consultants — win with data.");
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.waitForURL(`**/clients/${acme.id}?tab=people`);
  await expect(page.getByText("Skeptical of consultants — win with data.")).toBeVisible();
});
