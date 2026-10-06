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
  await page.getByRole("button", { name: "Quick tailor (no AI)" }).click();
  await page.waitForURL(/tailor\?v=/);
  await expect(page.getByText("v1 · quick tailor")).toBeVisible();

  // The most relevant bullet leads, unchanged.
  const firm = page.getByTestId("role-firm");
  await expect(firm.getByText("Built event-driven eligibility services on AWS Lambda")).toBeVisible();

  // An edit that adds a number is a must-fix; an em dash is too.
  await firm.getByRole("button", { name: "Edit" }).first().click();
  await firm.getByLabel("Edit firm-1").fill("Built event-driven eligibility services — on AWS Lambda for 40 states.");
  await expect(firm.getByText(/Must fix: Adds 40/)).toBeVisible();
  await expect(firm.getByText(/Must fix: No em dashes/)).toBeVisible();
  await expect(page.getByText("Has must-fix issues")).toBeVisible();
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
  await expect(page.getByText(/^v2 ·/)).toBeVisible();
  const [v2] = await queryRows(`SELECT data FROM "TailoredResume" WHERE version = 2`);
  const agencyBullets = v2.data.experience.find((r: { id: string }) => r.id === "agency").bullets;
  expect(agencyBullets.find((b: { id: string }) => b.id === "agency-2").status).toBe("rejected");
  expect(v2.data.experience.find((r: { id: string }) => r.id === "agency").omitted).toBe(true);

  // Preview shows the exact file; download is a separate step.
  await page.getByRole("link", { name: "Preview PDF" }).click();
  await expect(page.getByText("Quill_Jordan_Chesapeake-Civic-Digital_Senior-Software-Engineer-Medicaid-Modernization.pdf")).toBeVisible();
  await expect(page.getByText(/^1 page$/)).toBeVisible();
  const href = await page.getByRole("link", { name: "Download PDF" }).getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["content-disposition"]).toContain("attachment;");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Record that this version was sent; it locks.
  await page.getByRole("link", { name: "Back to editor" }).click();
  // A full page load: wait for hydration before using client-side buttons.
  await page.waitForLoadState("networkidle");
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
  await expect(panel.getByText("GATES")).toBeVisible();
  await panel.getByText("FIT TABLE").click();
  await expect(panel.getByText(/↳/).first()).toBeVisible(); // cited résumé bullets shown as text
  await expect(page.getByText("From Greenhouse")).toBeVisible();

  const [row] = await queryRows(`SELECT "fitAnalyzedAt" FROM "JobPosting" WHERE id = $1`, [id]);
  expect(row.fitAnalyzedAt).not.toBeNull();

  await page.goto("/jobs");
  await expect(page.getByTestId("job-row").first()).toContainText("Fit: Apply");
});

test("start from master, reuse it on another job, and change it by chatting with Claude", async ({ page }) => {
  await queryRows(`INSERT INTO "ResumeMaster" (id, version, data) VALUES ('m1', 1, $1::jsonb)`, [MASTER]);
  const [{ id }] = await queryRows(`SELECT id FROM "JobPosting" WHERE title = 'Senior Software Engineer, Medicaid Modernization'`);

  // The evaluation feeds the posting panel: requirements matched to bullets.
  await page.goto(`/jobs/${id}`);
  await expect(page.getByTestId("fit-panel").getByText("Test evaluation")).toBeVisible();
  await page.getByRole("link", { name: /Résumé for this job/ }).click();
  await page.waitForLoadState("networkidle");

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
  await expect(page.getByText(/^v2 ·/)).toBeVisible();
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
  await expect(page.getByLabel("Version to reuse")).toContainText("Chesapeake Civic Digital: Senior Software Engineer, Medicaid Modernization v2");
  await page.getByRole("button", { name: "Reuse this version" }).click();
  await page.waitForURL(/tailor\?v=/);
  await expect(page.getByText(/^v1 · reused/)).toBeVisible();
  await expect(page.getByText(/Copied from v2 for Senior Software Engineer, Medicaid Modernization/)).toBeVisible();
  await expect(page.getByTestId("role-agency").getByText("Left out of this version.")).toBeVisible();
});
