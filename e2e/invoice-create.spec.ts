import { test, expect, type Page } from "@playwright/test";
import { resetDb, insertClient } from "./utils/db";

const DETAIL_URL = /\/invoices\/(?!new$)[^/]+$/;

async function fillLine(
  page: Page,
  index: number,
  description: string,
  hours: string,
  rate: string
) {
  await page.getByLabel("Description", { exact: true }).nth(index).fill(description);
  await page.getByLabel("Hours", { exact: true }).nth(index).fill(hours);
  await page.getByLabel("Rate", { exact: true }).nth(index).fill(rate);
}

test.describe("invoice create/edit", () => {
  test.beforeEach(async () => {
    await resetDb();
    await insertClient({ name: "Acme Corp" });
  });

  test("creates the Mercury sample invoice", async ({ page }) => {
    await page.goto("/invoices/new");
    await expect(page.getByRole("heading", { name: "New invoice" })).toBeVisible();

    await page.getByLabel("Client").selectOption({ label: "Acme Corp" });

    const lines: [string, string][] = [
      ["Consulting Services: 06/14/26 – 06/20/26", "6"],
      ["Consulting Services: 06/21/26 – 06/27/26", "20"],
      ["Consulting Services: 06/28/26 – 07/04/26", "20"],
      ["Consulting Services: 07/05/26 – 07/11/26", "20"],
    ];
    for (let i = 1; i < lines.length; i++) {
      await page.getByRole("button", { name: "Add line" }).click();
    }
    for (let i = 0; i < lines.length; i++) {
      await fillLine(page, i, lines[i][0], lines[i][1], "90");
    }

    // Live footer total (66 h × $90 = $5,940.00, tax 0) before submitting.
    await expect(page.getByTestId("totals-subtotal")).toHaveText("$5,940.00");
    await expect(page.getByTestId("totals-total")).toHaveText("$5,940.00");

    await page.getByRole("button", { name: "Create invoice" }).click();
    await page.waitForURL(DETAIL_URL);

    // First invoice after resetDb (nextInvoiceNumber seeded to 1), still a draft.
    await expect(page.getByRole("heading", { name: /INV-ACME-0001/ })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  });

  test("live totals react to tax rate", async ({ page }) => {
    await page.goto("/invoices/new");
    await page.getByLabel("Client").selectOption({ label: "Acme Corp" });
    await fillLine(page, 0, "Consulting", "10", "100");

    await page.getByLabel("Tax rate (basis points)").fill("875");

    await expect(page.getByTestId("totals-subtotal")).toHaveText("$1,000.00");
    await expect(page.getByTestId("totals-tax")).toHaveText("$87.50");
    await expect(page.getByTestId("totals-total")).toHaveText("$1,087.50");
    await expect(page.getByText("Sales tax (8.75%)")).toBeVisible();
  });

  test("validation errors keep the user on the page", async ({ page }) => {
    await page.goto("/invoices/new");

    // No client selected, single empty line item.
    await page.getByRole("button", { name: "Create invoice" }).click();

    // exact: the select's placeholder option is "Select a client…".
    await expect(page.getByText("Select a client", { exact: true })).toBeVisible();
    await expect(page.getByText("Description is required")).toBeVisible();
    await expect(page).toHaveURL(/\/invoices\/new/);
  });

  test("edits a draft invoice", async ({ page }) => {
    // Create a simple draft via the UI.
    await page.goto("/invoices/new");
    await page.getByLabel("Client").selectOption({ label: "Acme Corp" });
    await fillLine(page, 0, "Consulting", "5", "100");
    await expect(page.getByTestId("totals-total")).toHaveText("$500.00");
    await page.getByRole("button", { name: "Create invoice" }).click();
    await page.waitForURL(DETAIL_URL);
    const detailUrl = new URL(page.url()).pathname;

    // Edit: bump the hours from 5 to 10.
    await page.goto(`${detailUrl}/edit`);
    await expect(page.getByRole("heading", { name: /Edit INV-ACME-0001/ })).toBeVisible();
    await page.getByLabel("Hours", { exact: true }).fill("10");
    await expect(page.getByTestId("totals-total")).toHaveText("$1,000.00");
    await page.getByRole("button", { name: "Save changes" }).click();

    await page.waitForURL(DETAIL_URL);
    await expect(page.getByRole("heading", { name: /INV-ACME-0001/ })).toBeVisible();
    await expect(page.getByText("$1,000.00")).toBeVisible();
  });
});
