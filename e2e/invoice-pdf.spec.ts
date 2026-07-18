import { test, expect } from "@playwright/test";
import { resetDb, insertClient, insertInvoice, insertLineItem } from "./utils/db";

let invoiceId: string;

test.beforeEach(async () => {
  await resetDb();
  const client = await insertClient();
  invoiceId = await insertInvoice(client.id, {
    status: "DRAFT",
    totalCents: 594000,
    issueDate: "2026-07-16",
    dueDate: "2026-08-07",
    number: "INV-0042",
  });
  await insertLineItem(invoiceId, {
    description: "Consulting Services: 06/14/26 – 06/20/26",
    quantity: 6,
    unitPriceCents: 9000,
    amountCents: 54000,
  });
});

test("pdf endpoint streams the invoice PDF inline", async ({ request }) => {
  const res = await request.get(`/api/invoices/${invoiceId}/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect(res.headers()["content-disposition"]).toContain("inline");
  expect(res.headers()["content-disposition"]).toContain("INV-0042.pdf");
  const body = await res.body();
  expect(body.length).toBeGreaterThan(3000);
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
});

test("download=1 sets attachment disposition", async ({ request }) => {
  const res = await request.get(`/api/invoices/${invoiceId}/pdf?download=1`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
});

test("unknown invoice returns 404", async ({ request }) => {
  const res = await request.get(`/api/invoices/nope/pdf`);
  expect(res.status()).toBe(404);
});
