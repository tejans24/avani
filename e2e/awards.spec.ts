import { test, expect } from "@playwright/test";
import { queryRows, resetDb } from "./utils/db";

/**
 * Federal awards feed, JOBS_SOURCE_MODE=fake (fictional awardees in
 * e2e/fixtures/jobs). One agency refreshes per tick, so tick once per agency.
 */

const NOW = "2026-10-02";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await queryRows(
    `INSERT INTO "JobBoard" (id, source, slug, "companyName", "updatedAt") VALUES ('b_gh', 'GREENHOUSE', 'chesapeakecivic', 'Chesapeake Civic Digital', NOW())`
  );
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
  for (let i = 0; i < 8; i++) expect((await page.request.get(`/api/events/tick?now=${NOW}`)).ok()).toBeTruthy();
});

test("awards link to companies, boost their postings, and surface hiring leads", async ({ page }) => {
  const [{ n: queries }] = await queryRows(`SELECT count(*)::int AS n FROM "AwardQuery" WHERE "lastError" IS NULL AND "lastFetchedAt" IS NOT NULL`);
  expect(queries).toBe(8);
  const [{ n: awards }] = await queryRows(`SELECT count(*)::int AS n FROM "ContractAward"`);
  expect(awards).toBe(3);

  // The CMS award links to the company we already track and boosts its posting.
  const [posting] = await queryRows(
    `SELECT p.id, p."scoreBreakdown" FROM "JobPosting" p WHERE p.title = 'Senior Software Engineer, Medicaid Modernization'`
  );
  const award = (posting.scoreBreakdown as { rule: string; evidence: string }[]).find((b) => b.rule === "current-award");
  expect(award?.evidence).toMatch(/Centers for Medicare and Medicaid Services · \$31\.5M · through Jul 2031/);

  const [{ n: announced }] = await queryRows(`SELECT count(*)::int AS n FROM "DomainEvent" WHERE type = 'jobs.awards_found'`);
  expect(announced).toBeGreaterThanOrEqual(1);

  // Climate tab: a winner with no job board yet is a lead.
  await page.goto("/jobs/awards");
  const lead = page.getByTestId("award-row").filter({ hasText: "Patuxent Earth Analytics" });
  await expect(lead).toContainText("$48.3M");
  await expect(lead).toContainText("air quality data platform modernization");
  await expect(lead.getByRole("link", { name: "Add board" })).toHaveAttribute("href", /\/jobs\/boards\?company=Patuxent/);

  // Health & civic tab: the tracked company shows its open match and board.
  await page.getByRole("link", { name: "Health & civic" }).click();
  const tracked = page.getByTestId("award-row").filter({ hasText: "Chesapeake Civic Digital" });
  await expect(tracked).toContainText("1 open match");
  await expect(tracked).toContainText("Board added");

  // The job page shows the company's awards for the call.
  await page.goto(`/jobs/${posting.id}`);
  const awardsFold = page.locator("summary", { hasText: "Federal awards" });
  await expect(awardsFold).toContainText("for Chesapeake Civic Digital");
  await awardsFold.click();
  // Listed in the awards panel and cited as the score evidence.
  await expect(page.getByText(/75FCMC26C0011/)).toHaveCount(2);
});
