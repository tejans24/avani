/**
 * Plain serializable shapes consumed by the invoice PDF renderer.
 * Everything is JSON-safe so the same data object can be built from a Prisma
 * result, a stored `fromSnapshot`, or a hand-written fixture (preview script).
 */

/** The "From" block: company identity + payment instructions, frozen at send time. */
export type InvoicePdfFrom = {
  companyName: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  email: string;
  phone?: string | null;
  paymentInstructions: string;
};

/** The "To" block: the client being billed. */
export type InvoicePdfTo = {
  name: string;
  contactName?: string | null;
  billingEmail: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export type InvoicePdfLineItem = {
  description: string;
  /** Display-ready quantity, trailing zeros trimmed ("20", "37.5"). */
  quantityStr: string;
  unitPriceCents: number;
  amountCents: number;
};

export type InvoicePdfData = {
  number: string;
  /** ISO date-only strings ("YYYY-MM-DD"). */
  issueDate: string;
  dueDate: string;
  payViaLabel: string;
  memo: string | null;
  taxRateBps: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  from: InvoicePdfFrom;
  to: InvoicePdfTo;
  lineItems: InvoicePdfLineItem[];
};
