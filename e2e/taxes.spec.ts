import { test, expect, type Page } from "@playwright/test";
import { complianceSeedsForYear } from "../prisma/seed-categories";
import {
  getCategoryIdByName,
  insertAccount,
  insertTransaction,
  queryRows,
  resetDb,
} from "./utils/db";

const YEAR = 2026;

/** Parse "$49,900.00" (or "-$12.34") into a dollar number. */
function parseDollars(text: string): number {
  return Number(text.replace(/[$,]/g, ""));
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

/** Insert the seeded federal compliance calendar (resetDb truncates it). */
async function seedDeadlines() {
  for (const d of [...complianceSeedsForYear(YEAR), ...complianceSeedsForYear(YEAR + 1)]) {
    await queryRows(
      `INSERT INTO "ComplianceDeadline" (id, key, title, "dueDate", "leadDays", enabled, notes)
       VALUES ($1, $2, $3, $4, $5, true, $6)`,
      [`testddl_${d.key}`, d.key, d.title, d.dueDate, d.leadDays, d.notes ?? null]
    );
  }
}

/**
 * $50,000 of categorized Client Revenue across Jan–Jun plus a $200 meals
 * expense (50% deductible) -> tax-view YTD net profit of exactly $49,900.
 */
async function seedProfit() {
  const acct = await insertAccount();
  const revenue = await getCategoryIdByName("Client Revenue");
  const meals = await getCategoryIdByName("Meals (50%)");
  const deposits: [string, number][] = [
    [`${YEAR}-01-15`, 1_000_000],
    [`${YEAR}-02-15`, 1_000_000],
    [`${YEAR}-03-15`, 1_000_000],
    [`${YEAR}-04-15`, 800_000],
    [`${YEAR}-05-15`, 700_000],
    [`${YEAR}-06-15`, 500_000],
  ];
  for (const [postedAt, amountCents] of deposits) {
    await insertTransaction(acct.id, {
      postedAt,
      amountCents,
      description: "Client wire",
      categoryId: revenue,
      status: "REVIEWED",
    });
  }
  await insertTransaction(acct.id, {
    postedAt: `${YEAR}-03-20`,
    amountCents: -20_000,
    description: "Team lunch",
    categoryId: meals,
    status: "REVIEWED",
  });
}

async function remainingFor(page: Page, quarter: number): Promise<number> {
  return parseDollars(await page.getByTestId(`q${quarter}-remaining`).innerText());
}

test.describe("taxes", () => {
  test.beforeEach(async ({ page }) => {
    await resetDb();
    await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
  });

  test("tax settings save via the UI and persist across reload", async ({ page }) => {
    await page.goto("/reports/taxes");

    // Fill-and-verify in one retry loop: a click that lands before hydration
    // on a cold dev server would fall through, so redo until the save lands.
    await expect(async () => {
      await page.locator("#federalRateBps").fill("2400");
      await page.locator("#stateRateBps").fill("930");
      await page.locator("#ownerSalaryAnnualCents").fill("60000");
      await page.locator("#withholdingYtdCents").fill("8000");
      await page.locator("#cpaFiles1120S").selectOption("yes");
      await page.locator("#payrollProvider").fill("Gusto");
      await page.getByRole("button", { name: "Save tax settings" }).click();
      await expect(page.getByText("Tax settings saved.")).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    await page.reload();
    await expect(page.locator("#federalRateBps")).toHaveValue("2400");
    await expect(page.locator("#stateRateBps")).toHaveValue("930");
    await expect(page.locator("#ownerSalaryAnnualCents")).toHaveValue("60000.00");
    await expect(page.locator("#withholdingYtdCents")).toHaveValue("8000.00");
    await expect(page.locator("#cpaFiles1120S")).toHaveValue("yes");
    await expect(page.locator("#payrollProvider")).toHaveValue("Gusto");
  });

  test("estimate card annualizes profit and shows the quarterly schedule", async ({
    page,
  }) => {
    await seedProfit();
    await page.goto("/reports/taxes");

    await expect(page.getByTestId("ytd-profit")).toHaveText("$49,900.00");
    const ytd = parseDollars(await page.getByTestId("ytd-profit").innerText());
    const annualized = parseDollars(
      await page.getByTestId("annualized-profit").innerText()
    );
    // Mid-year, annualizing must project above the YTD figure.
    expect(annualized).toBeGreaterThan(ytd);

    // Four quarters, each with a dollar target (seeded rates: 24% + 9.3%).
    for (const q of [1, 2, 3, 4]) {
      const row = page.getByTestId(`quarter-row-${q}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(`Q${q}`);
      await expect(row).toContainText(/\$[\d,]+\.\d{2}/);
    }
    // Cumulative Q4 target is the full annual estimate — well above zero.
    expect(await remainingFor(page, 4)).toBeGreaterThan(0);

    await expect(
      page.getByText("Estimate only — not tax advice. Confirm with your CPA.")
    ).toBeVisible();
  });

  test("recording and deleting a Q2 federal payment moves the remaining", async ({
    page,
  }) => {
    await seedProfit();
    await page.goto("/reports/taxes");

    const before = await remainingFor(page, 2);
    expect(before).toBeGreaterThan(3000);

    await expect(async () => {
      await page.locator("#quarter").selectOption("2");
      await page.locator("#jurisdiction").selectOption("FEDERAL");
      await page.locator("#amountCents").fill("3000");
      await page.getByRole("button", { name: "Record payment" }).click();
      await expect(page.getByTestId("payments-table")).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    const row = page.getByTestId("payments-table").locator("tbody tr");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Q2");
    await expect(row).toContainText("Federal");
    await expect(row).toContainText("$3,000.00");
    await expect(page.getByTestId("q2-remaining")).toHaveText(usd.format(before - 3000));

    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("payments-table")).toHaveCount(0);
    await expect(page.getByTestId("q2-remaining")).toHaveText(usd.format(before));
  });

  test("compliance list shows seeded deadlines and a toggle persists", async ({
    page,
  }) => {
    await seedDeadlines();
    await page.goto("/reports/taxes");

    await expect(
      page.getByText(`Form 1120-S (S-corp return) for ${YEAR - 1}`)
    ).toBeVisible();
    await expect(page.getByText(`Q3 ${YEAR} estimated tax payment`)).toBeVisible();

    const toggle = page.getByTestId(`deadline-toggle-payroll-q3-941-${YEAR}`);
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    // Click-and-verify loop (hydration-safe, same pattern as events.spec).
    await expect(async () => {
      if ((await toggle.getAttribute("aria-checked")) !== "false") {
        await toggle.click();
        await page.waitForTimeout(750);
        await page.reload();
      }
      await expect(toggle).toHaveAttribute("aria-checked", "false");
    }).toPass({ timeout: 30_000 });

    await page.reload();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("tick detects the approaching quarter exactly once", async ({ page }) => {
    await seedProfit();

    // 2026-09-05: Q3 (due 9/15) is 10 days out with remaining > 0.
    const tick = await page.request.get(`/api/events/tick?now=${YEAR}-09-05`);
    expect(tick.ok()).toBeTruthy();
    const body = await tick.json();
    expect(body.detected.quarterWindows).toBeGreaterThanOrEqual(1);

    await page.goto("/activity");
    await expect(page.getByText("Tax deadline").first()).toBeVisible();
    await expect(page.getByText(new RegExp(`Q3 due ${YEAR}-09-15`)).first()).toBeVisible();

    const tick2 = await page.request.get(`/api/events/tick?now=${YEAR}-09-06`);
    expect((await tick2.json()).detected.quarterWindows).toBe(0);
  });
});
