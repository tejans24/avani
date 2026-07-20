import { test, expect } from "@playwright/test";
import {
  insertClient,
  insertContact,
  insertInteraction,
  insertInvoice,
  queryRows,
  resetDb,
} from "./utils/db";

test.beforeEach(async ({ page }) => {
  await resetDb();
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
});

// Distinctive markers that must never cross to the client-facing surface.
const NOTE_MARKER = "ZZPOLITICSNOTEZZ";
const NEXT_STEP_MARKER = "ZZNEXTSTEPZZ";
const INTERACTION_MARKER = "ZZINTERACTIONZZ";
const CONTACT_NAME = "ZZCONTACTNAMEZZ";

test("internal CRM data never leaks onto the client invoice share page", async ({ page }) => {
  const acme = await insertClient({
    name: "Acme Corp",
    billingEmail: "ap@acme.example",
    stage: "LEAD",
    nextActionNote: NEXT_STEP_MARKER,
    dealValueCents: 5_000_00,
  });
  await insertContact(acme.id, { name: CONTACT_NAME, notes: NOTE_MARKER });
  await insertInteraction(acme.id, { type: "NOTE", body: INTERACTION_MARKER });

  const invoiceId = await insertInvoice(acme.id, {
    status: "SENT",
    totalCents: 100000,
    issueDate: "2026-07-01",
    dueDate: "2026-07-31",
    number: "INV-ACME-0001",
  });

  const token = "sharetoken_privacycheck_0001";
  await queryRows(`UPDATE "Invoice" SET "shareToken" = $1 WHERE id = $2`, [token, invoiceId]);

  await page.goto(`/i/${token}`);
  // Sanity: the public invoice actually rendered.
  await expect(page.getByText("INV-ACME-0001")).toBeVisible();
  await expect(page.getByText("Acme Corp")).toBeVisible();

  // None of the internal markers appear anywhere in the served HTML (this also
  // catches data embedded in the RSC payload, not just visible text).
  const html = await page.content();
  expect(html).not.toContain(NOTE_MARKER);
  expect(html).not.toContain(NEXT_STEP_MARKER);
  expect(html).not.toContain(INTERACTION_MARKER);
  expect(html).not.toContain(CONTACT_NAME);

  // The PDF endpoint is public via the token, but is built from invoice +
  // line items only — it must still respond without leaking (200).
  const pdf = await page.request.get(`/i/${token}/pdf`);
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
});
