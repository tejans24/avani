import { test, expect } from "@playwright/test";
import { queryRows, resetDb } from "./utils/db";

/**
 * Job finder end to end, with JOBS_SOURCE_MODE=fake (fixtures in
 * e2e/fixtures/jobs, fictional employers). Time is pinned with the tick's
 * `now` so the fixtures' posted dates stay inside the 30-day window.
 */

const NOW = "2026-10-02";

async function insertBoards() {
  await queryRows(
    `INSERT INTO "JobBoard" (id, source, slug, "companyName", "updatedAt") VALUES
      ('b_gh', 'GREENHOUSE', 'chesapeakecivic', 'Chesapeake Civic Digital', NOW()),
      ('b_lv', 'LEVER', 'chesapeakecivic', 'Chesapeake Civic Digital', NOW()),
      ('b_ab', 'ASHBY', 'tidewaterclimate', 'Tidewater Climate', NOW()),
      ('b_uj', 'USAJOBS', 'JobCategoryCode=2210&RemoteIndicator=True', 'USAJOBS IT remote', NOW())`
  );
}

async function postingId(title: string): Promise<string> {
  const rows = await queryRows(`SELECT id FROM "JobPosting" WHERE title = $1`, [title]);
  return rows[0].id as string;
}

test.beforeEach(async ({ page }) => {
  await resetDb();
  await insertBoards();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
  // The tick refreshes two due boards per run.
  for (let i = 0; i < 2; i++) {
    const res = await page.request.get(`/api/events/tick?now=${NOW}`);
    expect(res.ok()).toBeTruthy();
  }
});

test("refresh pulls postings, rejects the cross-posted duplicate, and filters with reasons", async ({ page }) => {
  const [{ n: postings }] = await queryRows(`SELECT count(*)::int AS n FROM "JobPosting"`);
  const [{ n: aliases }] = await queryRows(`SELECT count(*)::int AS n FROM "JobPostingAlias"`);
  expect(postings).toBe(5); // the Sales Engineer never got past the title prefilter
  expect(aliases).toBe(1); // the Lever copy of the Medicaid job

  const [{ n: announced }] = await queryRows(`SELECT count(*)::int AS n FROM "DomainEvent" WHERE type = 'jobs.new_matches'`);
  expect(announced).toBeGreaterThanOrEqual(1);

  await page.goto("/jobs");
  const rows = page.getByTestId("job-row");
  await expect(rows.first()).toContainText("Senior Software Engineer, Medicaid Modernization");
  await expect(rows.first()).toContainText("also on 1 other board");
  await expect(rows.first()).toContainText("401(k) · 5% match");
  await expect(page.getByText("Platform Engineer")).toHaveCount(0);

  await page.getByRole("link", { name: "Filtered out" }).click();
  await expect(page.getByText("Regular hybrid (set in-office days)")).toBeVisible();
  await expect(page.getByText("On-site role")).toBeVisible();
});

test("detail explains the score; marking applied logs it, sets a follow-up, and blocks delete", async ({ page }) => {
  const id = await postingId("Senior Software Engineer, Medicaid Modernization");
  await page.goto(`/jobs/${id}`);
  await expect(page.getByText(/Why it scored/)).toBeVisible();
  await expect(page.getByText("End-to-end ownership of a system or product")).toBeVisible();
  await expect(page.getByText("Parental leave · 12 weeks")).toBeVisible();

  await page.getByLabel("Status", { exact: true }).selectOption("APPLIED");
  await page.getByLabel("Note (optional)").fill("Applied through the careers site");
  await page.getByRole("button", { name: "Mark applied" }).click();
  await expect(page.getByText("New → Applied: Applied through the careers site")).toBeVisible();

  const [p] = await queryRows(`SELECT status, "appliedAt", "nextActionNote", "nextActionDue" FROM "JobPosting" WHERE id = $1`, [id]);
  expect(p.status).toBe("APPLIED");
  expect(p.appliedAt).not.toBeNull();
  expect(p.nextActionNote).toMatch(/follow up/i);

  await expect(page.getByRole("button", { name: "Delete" })).toBeDisabled();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
  await page.goto("/jobs?view=archived");
  await expect(page.getByText("Senior Software Engineer, Medicaid Modernization")).toBeVisible();
});

test("a deleted posting stays deleted when its board refreshes", async ({ page }) => {
  const id = await postingId("Founding Engineer");
  await page.goto(`/jobs/${id}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL("**/jobs");

  await page.goto("/jobs/boards");
  const ashby = page.getByRole("row", { name: /Tidewater Climate/ });
  await ashby.getByRole("button", { name: "Refresh now" }).click();
  await expect(ashby.getByText(/0 new, 1 refreshed/)).toBeVisible();

  const rows = await queryRows(`SELECT id FROM "JobPosting" WHERE title = 'Founding Engineer'`);
  expect(rows).toHaveLength(0);
});

test("paste capture adds a job; capturing a duplicate opens the existing one", async ({ page }) => {
  await page.goto("/jobs/capture");
  await page.getByLabel("Link to the posting").fill("https://careers.example.org/jobs/77?utm_source=li");
  await page
    .getByLabel("Job text")
    .fill("We are hiring a hands-on engineer to modernize a legacy grants system for a nonprofit. Remote. $190,000 - $210,000 salary.");
  await page.getByRole("button", { name: "Use this text" }).click();
  await page.getByLabel("Title").fill("Senior Software Engineer, Grants");
  await page.getByLabel("Company").fill("Example Grants Nonprofit");
  await page.getByLabel("Location").fill("Remote");
  await page.getByRole("button", { name: "Save job" }).click();
  await page.waitForURL(/\/jobs\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Senior Software Engineer, Grants" })).toBeVisible();
  const [created] = await queryRows(`SELECT url, "capturedVia" FROM "JobPosting" WHERE title = 'Senior Software Engineer, Grants'`);
  expect(created.url).toBe("https://careers.example.org/jobs/77");
  expect(created.capturedVia).toBe("paste");

  // The Medicaid job again, found on LinkedIn: no second posting.
  const existing = await postingId("Senior Software Engineer, Medicaid Modernization");
  await page.goto("/jobs/capture");
  await page.getByLabel("Link to the posting").fill("https://www.linkedin.com/jobs/view/123/");
  await page.getByLabel("Job text").fill("Sr. Software Engineer, Medicaid Modernization at Chesapeake Civic Digital. Remote.");
  await page.getByRole("button", { name: "Use this text" }).click();
  await page.getByLabel("Title").fill("Sr. Software Engineer, Medicaid Modernization");
  await page.getByLabel("Company").fill("Chesapeake Civic Digital");
  await page.getByLabel("Location").fill("Remote");
  await page.getByRole("button", { name: "Save job" }).click();
  await page.waitForURL(`**/jobs/${existing}?existing=1`);
  const [{ n }] = await queryRows(`SELECT count(*)::int AS n FROM "JobPosting" WHERE title ILIKE '%Medicaid%'`);
  expect(n).toBe(1);
});

test("bookmarklet works on a careers site that severs window.opener, and Claude fills a page with no job data", async ({ page, context }) => {
  // A Phenom-style careers page: Cross-Origin-Opener-Policy set, no JSON-LD.
  await context.route("https://careers.example.test/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "Cross-Origin-Opener-Policy": "same-origin" },
      body: `<html><head><title>Senior Cloud Architect - Example Federal</title></head><body>
<nav>Careers Home Search jobs</nav><h1>Senior Cloud Architect (Remote)</h1>
<p>Design and build AWS platforms end-to-end for federal health programs. This role is remote.</p>
<p>Requirements: 8+ years with AWS and Terraform.</p><footer>Cookie settings</footer></body></html>`,
    })
  );

  await page.goto("/jobs/capture");
  const href = await page.getByRole("link", { name: "Add to Avani" }).getAttribute("href");
  const job = await context.newPage();
  await job.goto("https://careers.example.test/job/R1");
  const popupPromise = context.waitForEvent("page");
  await job.evaluate((code) => {
    (0, eval)(code);
  }, decodeURIComponent(href!.replace(/^javascript:/, "")));
  const popup = await popupPromise;
  await popup.route("https://fonts.googleapis.com/**", (r) => r.abort());

  await expect(popup.getByText("Got the page. Check the details, then save.")).toBeVisible();
  // The data travelled in the URL fragment, which is cleared after reading.
  expect(new URL(popup.url()).hash).toBe("");

  await popup.getByRole("button", { name: "Fill with Claude" }).click();
  await expect(popup.getByText("Filled by Claude from the page. Check every field, then save.")).toBeVisible();
  await expect(popup.getByLabel("Title")).toHaveValue("Senior Cloud Architect");
  await expect(popup.getByLabel("Company")).toHaveValue("Example Federal");
  await expect(popup.getByLabel("Location")).toHaveValue("Remote");

  await popup.getByRole("button", { name: "Save job" }).click();
  await popup.waitForURL(/\/jobs\/[a-z0-9]+$/);
  const [saved] = await queryRows(`SELECT "capturedVia", url FROM "JobPosting" WHERE title = 'Senior Cloud Architect'`);
  expect(saved).toEqual({ capturedVia: "bookmarklet", url: "https://careers.example.test/job/R1" });
});
