import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { dateToIso } from "@/lib/dates";
import { InvoicePdf } from "./InvoicePdf";
import type { InvoicePdfData, InvoicePdfFrom } from "./types";

/** Thrown by renderInvoicePdfBuffer when no invoice exists for the given id. */
export class InvoiceNotFoundError extends Error {
  constructor(invoiceId: string) {
    super(`Invoice not found: ${invoiceId}`);
    this.name = "InvoiceNotFoundError";
  }
}

/* ------------------------------------------------------------------ */
/* Structural input types (satisfied by Prisma results)               */
/* ------------------------------------------------------------------ */

/** CompanySettings fields the PDF pipeline needs (structural, Prisma-compatible). */
export type SettingsForPdf = {
  companyName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  email: string;
  phone: string | null;
  payViaLabel: string;
  paymentInstructions: string;
};

/** Invoice (with client + lineItems) fields the PDF pipeline needs. */
export type InvoiceForPdf = {
  number: string;
  issueDate: Date;
  dueDate: Date;
  taxRateBps: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  memo: string | null;
  fromSnapshot: unknown;
  client: {
    name: string;
    contactName: string | null;
    billingEmail: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  lineItems: {
    description: string;
    /** Prisma Decimal (or anything that stringifies to a decimal number). */
    quantity: { toString(): string };
    unitPriceCents: number;
    amountCents: number;
    sortOrder: number;
  }[];
};

/* ------------------------------------------------------------------ */
/* Mapping helpers                                                    */
/* ------------------------------------------------------------------ */

/** "20.00" -> "20", "37.50" -> "37.5", "6" -> "6". */
function formatQuantity(quantity: { toString(): string }): string {
  let s = quantity.toString();
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s === "" || s === "-" ? "0" : s;
}

/** Produce the `from` JSON shape stored in Invoice.fromSnapshot at send time. */
export function settingsToSnapshot(settings: SettingsForPdf): InvoicePdfFrom {
  return {
    companyName: settings.companyName,
    addressLine1: settings.addressLine1,
    addressLine2: settings.addressLine2,
    city: settings.city,
    state: settings.state,
    postalCode: settings.postalCode,
    country: settings.country,
    email: settings.email,
    phone: settings.phone,
    paymentInstructions: settings.paymentInstructions,
  };
}

function isFromSnapshot(value: unknown): value is InvoicePdfFrom {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.companyName === "string" &&
    typeof v.addressLine1 === "string" &&
    typeof v.email === "string" &&
    typeof v.paymentInstructions === "string"
  );
}

/**
 * Map a loaded invoice (+ current settings) to the serializable PDF props.
 * The frozen `fromSnapshot` wins over current settings when present, so
 * editing CompanySettings never rewrites already-sent invoices. Exported so
 * the send-email flow can reuse the exact same mapping.
 */
export function buildInvoicePdfData(
  invoice: InvoiceForPdf,
  settings: SettingsForPdf | null
): InvoicePdfData {
  const from: InvoicePdfFrom | null = isFromSnapshot(invoice.fromSnapshot)
    ? invoice.fromSnapshot
    : settings
      ? settingsToSnapshot(settings)
      : null;
  if (!from) {
    throw new Error(
      `Invoice ${invoice.number} has no fromSnapshot and CompanySettings is not configured.`
    );
  }

  const lineItems = [...invoice.lineItems]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      description: item.description,
      quantityStr: formatQuantity(item.quantity),
      unitPriceCents: item.unitPriceCents,
      amountCents: item.amountCents,
    }));

  return {
    number: invoice.number,
    issueDate: dateToIso(invoice.issueDate),
    dueDate: dateToIso(invoice.dueDate),
    payViaLabel: settings?.payViaLabel ?? "Manual transfer (ACH/Wire)",
    memo: invoice.memo,
    taxRateBps: invoice.taxRateBps,
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    from,
    to: {
      name: invoice.client.name,
      contactName: invoice.client.contactName,
      billingEmail: invoice.client.billingEmail,
      addressLine1: invoice.client.addressLine1,
      addressLine2: invoice.client.addressLine2,
      city: invoice.client.city,
      state: invoice.client.state,
      postalCode: invoice.client.postalCode,
      country: invoice.client.country,
    },
    lineItems,
  };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

/** Render already-mapped PDF data to a Buffer. */
export async function renderInvoicePdfDataToBuffer(
  data: InvoicePdfData
): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf data={data} />);
}

/**
 * Load an invoice by id (with client, line items, and company settings) and
 * render it to a PDF buffer. Throws InvoiceNotFoundError when the id doesn't
 * match an invoice.
 */
export async function renderInvoicePdfBuffer(
  invoiceId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const [invoice, settings] = await Promise.all([
    db.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: true,
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    }),
    db.companySettings.findUnique({ where: { id: 1 } }),
  ]);

  if (!invoice) {
    throw new InvoiceNotFoundError(invoiceId);
  }

  const data = buildInvoicePdfData(invoice, settings);
  const buffer = await renderInvoicePdfDataToBuffer(data);
  const filename = `${invoice.number.replace(/[^\w.-]+/g, "_")}.pdf`;
  return { buffer, filename };
}
