/**
 * Dev helper: render a sample invoice PDF without touching the database.
 *
 *   npx tsx scripts/preview-pdf.ts [outputPath]
 *
 * Builds an InvoicePdfData literal (Mercury-style consulting invoice, total
 * $5,940.00) and writes the rendered PDF to the given path (default: the
 * session scratchpad).
 */
import { createElement, type ReactElement } from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { InvoicePdf } from "../src/pdf/InvoicePdf";
import type { InvoicePdfData } from "../src/pdf/types";

const DEFAULT_OUT =
  "/tmp/claude-0/-home-user-avani/14d11e7c-0eae-51bf-8fc7-775a04af7193/scratchpad/invoice-preview.pdf";

const sample: InvoicePdfData = {
  number: "INV-0001",
  issueDate: "2026-07-13",
  dueDate: "2026-08-03",
  payViaLabel: "Manual transfer (ACH/Wire)",
  memo:
    "Payment is due within 15 business days of the invoice date. " +
    "Please include the invoice number with your payment.",
  taxRateBps: 0,
  subtotalCents: 594000,
  taxCents: 0,
  totalCents: 594000,
  from: {
    companyName: "Avani Studio LLC",
    addressLine1: "2261 Market Street",
    addressLine2: "STE 4021",
    city: "San Francisco",
    state: "CA",
    postalCode: "94114",
    country: "USA",
    email: "billing@avani.studio",
    phone: "(415) 555-0132",
    paymentInstructions:
      "Bank: Mercury (Choice Financial Group)\n" +
      "Routing number: 084106768\n" +
      "Account number: 9876543210\n" +
      "Account name: Avani Studio LLC\n" +
      "\n" +
      "Please reference INV-0001 in your transfer memo.",
  },
  to: {
    name: "Meridian Labs, Inc.",
    contactName: "Dana Whitfield",
    billingEmail: "ap@meridianlabs.com",
    addressLine1: "500 Harrison Ave",
    addressLine2: "Floor 3",
    city: "Boston",
    state: "MA",
    postalCode: "02118",
    country: "USA",
  },
  lineItems: [
    {
      description: "Consulting Services: 06/14/26 – 06/20/26",
      quantityStr: "6",
      unitPriceCents: 9000,
      amountCents: 54000,
    },
    {
      description: "Consulting Services: 06/21/26 – 06/27/26",
      quantityStr: "20",
      unitPriceCents: 9000,
      amountCents: 180000,
    },
    {
      description: "Consulting Services: 06/28/26 – 07/04/26",
      quantityStr: "20",
      unitPriceCents: 9000,
      amountCents: 180000,
    },
    {
      description: "Consulting Services: 07/05/26 – 07/11/26",
      quantityStr: "20",
      unitPriceCents: 9000,
      amountCents: 180000,
    },
  ],
};

async function main() {
  const outPath = resolve(process.argv[2] ?? DEFAULT_OUT);
  // InvoicePdf renders a <Document> at its root, so this element is a valid
  // Document element at runtime even though its props type is { data }.
  const element = createElement(InvoicePdf, {
    data: sample,
  }) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath} (${buffer.byteLength} bytes)`);
  // Sanity floor: a truncated/empty render is well under this. A full one-page
  // invoice is ~4.5KB because the base-14 Helvetica fonts embed no font data.
  if (buffer.byteLength < 3 * 1024) {
    console.warn("Warning: PDF is suspiciously small (<3KB).");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
