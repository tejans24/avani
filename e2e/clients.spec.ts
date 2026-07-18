import { test, expect } from "@playwright/test";
import { insertClient, resetDb } from "./utils/db";

test.describe("clients", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("creates a client via the form", async ({ page }) => {
    await page.goto("/clients/new");
    await expect(page.getByRole("heading", { name: "New client" })).toBeVisible();

    await page.locator("#name").fill("Acme Corp");
    await page.locator("#contactName").fill("Pat Doe");
    await page.locator("#billingEmail").fill("billing@acme.example");
    await page.locator("#ccEmails").fill("a@x.com, b@x.com");
    await page.locator("#addressLine1").fill("456 Market St");
    await page.locator("#city").fill("New York");
    await page.locator("#state").fill("NY");
    await page.locator("#postalCode").fill("10001");
    await page.locator("#country").fill("USA");

    await page.getByRole("button", { name: "Create client" }).click();

    await page.waitForURL("**/clients");
    const row = page.locator(".data-table tbody tr", { hasText: "Acme Corp" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("billing@acme.example");
  });

  test("validates required fields", async ({ page }) => {
    await page.goto("/clients/new");

    await page.getByRole("button", { name: "Create client" }).click();

    await expect(page.getByText("Name is required")).toBeVisible();
    await expect(page.getByText("Enter a valid email").first()).toBeVisible();
    await expect(page).toHaveURL(/\/clients\/new$/);
  });

  test("edits a client", async ({ page }) => {
    await insertClient({ name: "Acme Corp" });

    await page.goto("/clients");
    await page.getByRole("link", { name: "Acme Corp" }).click();

    await page.waitForURL("**/clients/*/edit");
    await expect(page.locator("#name")).toHaveValue("Acme Corp");

    await page.locator("#name").fill("Acme Holdings");
    await page.getByRole("button", { name: "Save changes" }).click();

    await page.waitForURL("**/clients");
    await expect(page.getByRole("link", { name: "Acme Holdings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Acme Corp", exact: true })).toHaveCount(0);
  });

  test("archives a client", async ({ page }) => {
    const client = await insertClient({ name: "Acme Corp" });

    await page.goto(`/clients/${client.id}/edit`);
    await page.getByRole("button", { name: "Archive" }).click();

    await page.waitForURL("**/clients");
    await expect(page.locator(".data-table")).toHaveCount(0);
    await expect(page.getByText("No clients yet", { exact: false })).toBeVisible();

    await page.goto("/clients?archived=1");
    const row = page.locator(".data-table tbody tr", { hasText: "Acme Corp" });
    await expect(row).toBeVisible();
    await expect(row.getByText("Archived")).toBeVisible();
  });
});
