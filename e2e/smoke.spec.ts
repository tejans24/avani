import { test, expect } from "@playwright/test";

test("marketing homepage renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toContainText("Avani");
});

test("platform dashboard renders in test auth mode", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
