import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { queryRows, resetDb } from "./utils/db";

/**
 * Master import → quick tailor (no AI) → review with truth/style guards →
 * new version → PDF preview + download → applied with that exact version.
 */

const MASTER = readFileSync(join(__dirname, "fixtures", "master-resume.json"), "utf8");

test.beforeEach(async ({ page }) => {
  await resetDb();
  await queryRows(
    `INSERT INTO "JobBoard" (id, source, slug, "companyName", "updatedAt") VALUES ('b_gh', 'GREENHOUSE', 'chesapeakecivic', 'Chesapeake Civic Digital', NOW())`
  );
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
  expect((await page.request.get("/api/events/tick?now=2026-10-02")).ok()).toBeTruthy();
});

test("tailor, guard, version, preview, download, and record the version sent", async ({ page }) => {
  await page.goto("/jobs/resume");
  await page.getByLabel("Or paste master.json").fill(MASTER);
  await page.getByRole("button", { name: "Import as new version" }).click();
  await expect(page.getByText("Imported version 1.")).toBeVisible();

  const [{ id }] = await queryRows(`SELECT id FROM "JobPosting" WHERE title = 'Senior Software Engineer, Medicaid Modernization'`);
  await page.goto(`/jobs/${id}/tailor`);
  await page.getByText("Other ways to start").click();
  await page.getByRole("button", { name: "Quick tailor (no AI)" }).click();
  await page.waitForURL(/tailor\?v=/);
  await expect(page.getByText("v1 · quick tailor")).toBeVisible();
  await page.getByText("Edit line by line").click();

  // The most relevant bullet leads, unchanged.
  const firm = page.getByTestId("role-firm");
  await expect(firm.getByText("Built event-driven eligibility services on AWS Lambda")).toBeVisible();

  // An edit that adds a number is a must-fix; an em dash is too.
  await firm.getByRole("button", { name: "Edit" }).first().click();
  await firm.getByLabel("Edit firm-1").fill("Built event-driven eligibility services — on AWS Lambda for 40 states.");
  await expect(firm.getByText(/Must fix: Adds 40/)).toBeVisible();
  await expect(firm.getByText(/Must fix: No em dashes/)).toBeVisible();
  await expect(page.getByText("Has must-fix issues", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "I applied with this version" })).toBeDisabled();

  // Back to the original wording, reject the mentoring bullet, save as v2.
  await firm.getByRole("button", { name: "Use original" }).click();
  await expect(page.getByText("Ready to export")).toBeVisible();
  const agency = page.getByTestId("role-agency");
  await agency.getByRole("button", { name: "Reject" }).nth(1).click();
  await expect(agency.getByText("Rejected", { exact: true })).toHaveCount(1);

  // Leaving out the current role would open a gap; the oldest one wouldn't.
  await firm.getByRole("button", { name: "Leave out" }).click();
  await expect(firm.getByText(/Leaves a gap in your history, Mar 2021 to/)).toBeVisible();
  await firm.getByRole("button", { name: "Include role" }).click();
  await agency.getByRole("button", { name: "Leave out" }).click();
  await expect(agency.getByText("Left out of this version.")).toBeVisible();
  await expect(agency.getByText(/Leaves a gap/)).toHaveCount(0);
  await page.getByRole("button", { name: "Save as new version" }).click();
  await page.waitForURL(/tailor\?v=/);
  await expect(page.getByText(/^v2 · .* · made /)).toBeVisible();
  const [v2] = await queryRows(`SELECT data FROM "TailoredResume" WHERE version = 2`);
  const agencyBullets = v2.data.experience.find((r: { id: string }) => r.id === "agency").bullets;
  expect(agencyBullets.find((b: { id: string }) => b.id === "agency-2").status).toBe("rejected");
  expect(v2.data.experience.find((r: { id: string }) => r.id === "agency").omitted).toBe(true);

  // Preview opens over the editor and shows the exact file; download is a separate step.
  await page.getByRole("button", { name: "Preview PDF" }).click();
  const preview = page.getByRole("dialog");
  // The first render after a dev-server start compiles the PDF route: allow for it.
  await expect(preview.getByText("Quill_Jordan_Chesapeake-Civic-Digital_Senior-Software-Engineer-Medicaid-Modernization.pdf")).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByText(/^1 page$/)).toBeVisible();
  // The preview iframe may show it: the PDF allows framing by the app (and only the app).
  const inline = await page.request.get((await preview.locator("iframe").getAttribute("src"))!);
  expect(inline.headers()["content-type"]).toBe("application/pdf");
  expect(inline.headers()["content-security-policy"]).toBe("frame-ancestors 'self'");
  const href = await preview.getByRole("link", { name: "Download" }).getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["content-disposition"]).toContain("attachment;");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await preview.getByRole("button", { name: "Close preview" }).click();
  await expect(preview).toBeHidden();

  // Record that this version was sent; it locks.
  await page.getByRole("button", { name: "I applied with this version" }).click();
  await expect(page.getByText(/sent with your application \(locked\)/)).toBeVisible();
  const [p] = await queryRows(
    `SELECT p.status, t.version FROM "JobPosting" p JOIN "TailoredResume" t ON t.id = p."appliedResumeId" WHERE p.id = $1`,
    [id]
  );
  expect(p).toEqual({ status: "APPLIED", version: 2 });
});

test("the evaluator runs on its own the first time a matching job is opened, and its verdict shows in the list", async ({ page }) => {
  await queryRows(`INSERT INTO "ResumeMaster" (id, version, data) VALUES ('m1', 1, $1::jsonb)`, [MASTER]);
  const [{ id }] = await queryRows(`SELECT id FROM "JobPosting" WHERE title = 'Senior Software Engineer, Medicaid Modernization'`);

  await page.goto(`/jobs/${id}`);
  const panel = page.getByTestId("fit-panel");
  await expect(panel.getByText("Test evaluation")).toBeVisible();
  await expect(panel.getByText("Fake evaluation of Senior Software Engineer, Medicaid Modernization at Chesapeake Civic Digital.")).toBeVisible();
  await expect(panel.getByText(/App checks: location/)).toContainText("Remote");
  await panel.getByText(/^Full evaluation/).click();
  await expect(panel.getByText("GATES", { exact: true })).toBeVisible();
  await panel.getByText("FIT TABLE", { exact: true }).click();
  await expect(panel.getByText(/↳/).first()).toBeVisible(); // cited résumé bullets shown as text
  await expect(page.getByText("From Greenhouse")).toBeVisible();

  const [row] = await queryRows(`SELECT "fitAnalyzedAt" FROM "JobPosting" WHERE id = $1`, [id]);
  expect(row.fitAnalyzedAt).not.toBeNull();

  await page.goto("/jobs");
  await expect(page.getByTestId("job-row").first()).toContainText(/^Apply\s*score 100/);
});

test("start from master, reuse it on another job, and change it by chatting with Claude", async ({ page }) => {
  await queryRows(`INSERT INTO "ResumeMaster" (id, version, data) VALUES ('m1', 1, $1::jsonb)`, [MASTER]);
  const [{ id }] = await queryRows(`SELECT id FROM "JobPosting" WHERE title = 'Senior Software Engineer, Medicaid Modernization'`);

  // The evaluation feeds the posting panel: requirements matched to bullets.
  await page.goto(`/jobs/${id}`);
  await expect(page.getByTestId("fit-panel").getByText("Test evaluation")).toBeVisible();
  await page.goto(`/jobs/${id}/tailor`);
  await page.waitForLoadState("networkidle");

  await page.getByText("Other ways to start").click();
  await page.getByRole("button", { name: "Use master as is" }).click();
  await page.waitForURL(/tailor\?v=/);
  await expect(page.getByText(/^v1 · master as is/)).toBeVisible();
  await expect(page.getByText("Ready to export")).toBeVisible();

  const panel = page.getByTestId("posting-panel");
  await panel.getByRole("button").first().click();
  await expect(page.locator("[data-focused]").first()).toBeVisible();
  await expect(page.getByText(/^Answers: /).first()).toBeVisible();

  // Chat: the fake Claude leaves out the role it's asked to; nothing changes until Apply.
  await page.waitForLoadState("networkidle");
  const chat = page.getByTestId("tailor-chat");
  await chat.getByLabel("Message to Claude").fill("Please leave out agency, it's old.");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByText("Left out Senior Engineer at Example Digital Service.")).toBeVisible();
  const agency = page.getByTestId("role-agency");
  await expect(agency.getByText("Left out of this version.")).toHaveCount(0);
  await chat.getByRole("button", { name: "Apply changes" }).click();
  await expect(agency.getByText("Left out of this version.")).toBeVisible();
  await chat.getByRole("button", { name: "Undo" }).click();
  await expect(agency.getByText("Left out of this version.")).toHaveCount(0);
  await chat.getByLabel("Message to Claude").fill("leave out agency");
  await chat.getByRole("button", { name: "Send" }).click();
  await chat.getByRole("button", { name: "Apply changes" }).click();
  await page.getByRole("button", { name: "Save as new version" }).click();
  await page.waitForURL(/tailor\?v=/);
  await expect(page.getByText(/^v2 · .* · made /)).toBeVisible();
  const [v2] = await queryRows(`SELECT data FROM "TailoredResume" WHERE version = 2 AND "postingId" = $1`, [id]);
  expect(v2.data.experience.find((r: { id: string }) => r.id === "agency").omitted).toBe(true);

  // The conversation is kept with the job.
  const [{ tailorChat }] = await queryRows(`SELECT "tailorChat" FROM "JobPosting" WHERE id = $1`, [id]);
  expect(tailorChat).toHaveLength(4);
  await page.reload();
  await expect(page.getByTestId("tailor-chat").getByText("Please leave out agency, it's old.")).toBeVisible();

  // Another job can start from this one.
  const [{ id: other }] = await queryRows(`SELECT id FROM "JobPosting" WHERE id <> $1 LIMIT 1`, [id]);
  await page.goto(`/jobs/${other}/tailor`);
  await page.waitForLoadState("networkidle");
  await page.getByText("Other ways to start").click();
  await expect(page.getByLabel("Version to reuse")).toContainText("Chesapeake Civic Digital: Senior Software Engineer, Medicaid Modernization v2");
  await page.getByRole("button", { name: "Reuse this version" }).click();
  await page.waitForURL(/tailor\?v=/);
  await expect(page.getByText(/^v1 · reused/)).toBeVisible();
  await expect(page.getByText(/Copied from v2 for Senior Software Engineer, Medicaid Modernization/)).toBeVisible();
  await page.getByText("Edit line by line").click();
  await expect(page.getByTestId("role-agency").getByText("Left out of this version.")).toBeVisible();
});

test("application answers: the app fills personal ones, Claude drafts the rest, and the chat adds drafts", async ({ page }) => {
  await queryRows(`INSERT INTO "ResumeMaster" (id, version, data) VALUES ('m1', 1, $1::jsonb)`, [MASTER]);
  const [{ id }] = await queryRows(`SELECT id FROM "JobPosting" WHERE title = 'Senior Software Engineer, Medicaid Modernization'`);
  await page.goto(`/jobs/${id}`);
  await expect(page.getByTestId("fit-panel").getByText("Test evaluation")).toBeVisible();
  await page.waitForLoadState("networkidle");

  const qa = page.getByTestId("application-answers");
  await qa.getByLabel("Application questions").fill("1. First name *\nEmail (required)\nAre you legally authorized to work in the United States?\nWhy do you want to work here?\nGender");
  await qa.getByRole("button", { name: "Fill answers" }).click();
  await expect(qa.getByText("4 filled by the app, 1 drafted by Claude.")).toBeVisible();
  await expect(qa.getByLabel("Answer: First name")).toHaveValue("Jordan");
  await expect(qa.getByLabel("Answer: Email")).toHaveValue("jordan@example.com");
  await expect(qa.getByLabel("Answer: Are you legally authorized to work in the United States?")).toHaveValue("Yes");
  await expect(qa.getByLabel("Answer: Gender")).toHaveValue("");
  await expect(qa.getByText(/Voluntary self-identification/)).toBeVisible();
  await expect(qa.getByLabel("Answer: Why do you want to work here?")).toHaveValue("Fake draft for: Why do you want to work here?");

  // An edit becomes the owner's; filling again doesn't overwrite it.
  await qa.getByLabel("Answer: Why do you want to work here?").fill("Because of the Medicaid work.");
  await qa.getByRole("button", { name: "Save" }).click();
  await expect(qa.getByText("Yours")).toBeVisible();
  await qa.getByLabel("Application questions").fill("Why do you want to work here?");
  await qa.getByRole("button", { name: "Fill answers" }).click();
  await expect(qa.getByText(/drafted by Claude\.$/)).toBeVisible();
  await expect(qa.getByLabel("Answer: Why do you want to work here?")).toHaveValue("Because of the Medicaid work.");

  // The chat about the job can draft an answer into the list.
  const chat = page.getByTestId("job-chat");
  await chat.getByLabel("Message about this job").fill("Draft: What interests you about public sector work?");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByText("Here's a draft.")).toBeVisible();
  await chat.getByRole("button", { name: "Add to application answers" }).click();
  await expect(qa.getByLabel("Answer: What interests you about public sector work?")).toHaveValue("Fake draft for: What interests you about public sector work?");

  const [row] = await queryRows(`SELECT "applicationAnswers", "jobChat" FROM "JobPosting" WHERE id = $1`, [id]);
  expect(row.applicationAnswers).toHaveLength(6);
  expect(row.jobChat).toHaveLength(2);
});

test("a job page with its application form: the questions land in the job's answers", async ({ page }) => {
  await queryRows(`INSERT INTO "ResumeMaster" (id, version, data) VALUES ('m1', 1, $1::jsonb)`, [MASTER]);
  const text = [
    "Climate Data Engineer",
    "Annapolis, MD",
    "Apply",
    "Join Tidewater Climate, a nonprofit building flood-risk tools for coastal towns. You will own our data platform end to end.",
    "The pay range for this role is:",
    "$150,000 - $190,000 USD",
    "Apply for this job",
    "*",
    "indicates a required field",
    "First Name*",
    "Email*",
    "Country*",
    "Are you legally authorized to work in the United States?*",
    "Select...",
    "Why do you want to work on climate risk?*",
    "Gender*",
    "Select...",
    "Submit application",
  ].join("\n");

  await page.goto("/jobs/capture");
  await page.getByLabel("Link to the posting").fill("https://job-boards.greenhouse.io/tidewaterclimate/jobs/77");
  await page.getByLabel("Job text").fill(text);
  await page.getByRole("button", { name: "Use this text" }).click();
  await expect(page.getByLabel("Company")).toHaveValue("Tidewater Climate");
  await expect(page.getByLabel("Location")).toHaveValue("Annapolis, MD");
  await expect(page.getByLabel("Pay max ($/yr)")).toHaveValue("190000");
  await expect(page.getByTestId("form-questions")).toContainText("Found 6 application questions");
  await expect(page.getByLabel("Description")).not.toHaveValue(/First Name/);
  await page.getByRole("button", { name: "Save job" }).click();
  await page.waitForURL(/\/jobs\/[a-z0-9]+$/);

  const qa = page.getByTestId("application-answers");
  await expect(qa.getByLabel("Answer: First Name")).toHaveValue("Jordan");
  await expect(qa.getByLabel("Answer: Country")).toHaveValue("United States");
  await expect(qa.getByLabel("Answer: Are you legally authorized to work in the United States?")).toHaveValue("Yes");
  await expect(qa.getByText("Not drafted yet")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  await qa.getByRole("button", { name: "Draft the other 1 with Claude" }).click();
  await expect(qa.getByLabel("Answer: Why do you want to work on climate risk?")).toHaveValue("Fake draft for: Why do you want to work on climate risk?");
  await expect(qa.getByText("Not drafted yet")).toHaveCount(0);
});

test("one click from the job page makes the résumé, and the cover letter only opens when it's needed", async ({ page }) => {
  await queryRows(`INSERT INTO "ResumeMaster" (id, version, data) VALUES ('m1', 1, $1::jsonb)`, [MASTER]);
  const [{ id }] = await queryRows(`SELECT id FROM "JobPosting" WHERE title = 'Senior Software Engineer, Medicaid Modernization'`);
  await page.goto(`/jobs/${id}`);
  const steps = page.getByTestId("job-steps");
  await expect(steps.getByText("Not needed.")).toBeVisible(); // the evaluation's cover letter call
  await steps.getByRole("link", { name: "Make my résumé" }).click();
  await page.waitForURL(/tailor\?v=/, { timeout: 60_000 });
  await expect(page.getByText(/^v1 · .* · made just now/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview PDF" })).toBeVisible();
  await expect(page.getByTestId("cover-letter")).not.toHaveAttribute("open", "");

  await page.goto(`/jobs/${id}`);
  await expect(steps.getByText("Version 1 ready")).toBeVisible();
  await expect(steps.getByRole("link", { name: "Open résumé" })).toBeVisible();
});

test("Have Claude read the next few: verdicts land on the list without opening each job", async ({ page }) => {
  await queryRows(`INSERT INTO "ResumeMaster" (id, version, data) VALUES ('m1', 1, $1::jsonb)`, [MASTER]);
  await page.goto("/jobs");
  await expect(page.getByTestId("job-row").first()).toContainText("not read yet");
  await page.getByRole("button", { name: /Have Claude read the next/ }).click();
  await expect(page.getByText(/Evaluated \d jobs?/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("job-row").first()).toContainText(/^Apply/);
  const [{ n }] = await queryRows(`SELECT count(*)::int AS n FROM "JobPosting" WHERE "fitAnalyzedAt" IS NULL AND "filterFailures" = '{}'`);
  expect(n).toBe(0);
});

test("a job that isn't remote waits for Evaluate, and the list's batch skips it", async ({ page }) => {
  await queryRows(`INSERT INTO "ResumeMaster" (id, version, data) VALUES ('m1', 1, $1::jsonb)`, [MASTER]);
  const [{ id }] = await queryRows(
    `UPDATE "JobPosting" SET "workMode" = 'OCCASIONAL_HYBRID' WHERE title = 'Senior Software Engineer, Medicaid Modernization' RETURNING id`
  );

  await page.goto(`/jobs/${id}`);
  const panel = page.getByTestId("fit-panel");
  await expect(panel.getByText(/isn't remote, so Claude doesn't read it unless you ask/)).toBeVisible();
  await expect(page.getByTestId("job-steps")).toContainText("Not remote, so Claude waits for you");
  await page.waitForTimeout(1500);
  const [before] = await queryRows(`SELECT "fitAnalyzedAt" FROM "JobPosting" WHERE id = $1`, [id]);
  expect(before.fitAnalyzedAt).toBeNull();

  // The list's batch only counts remote matches; this one isn't, and it's the only open match here.
  await page.goto("/jobs");
  await expect(page.getByTestId("job-row").first()).toContainText("not read yet");
  await expect(page.getByRole("button", { name: /Have Claude read/ })).toHaveCount(0);

  // Asking for it works.
  await page.goto(`/jobs/${id}`);
  await panel.getByRole("button", { name: "Evaluate" }).click();
  await expect(panel.getByText("Test evaluation")).toBeVisible({ timeout: 60_000 });
});
