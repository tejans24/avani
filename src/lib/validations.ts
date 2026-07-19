import { z } from "zod";

/**
 * Shared zod v4 schemas used by react-hook-form on the client and by server
 * actions. Form-friendly shapes: dates are "YYYY-MM-DD" strings, money is
 * integer cents, hours are plain numbers with up to 2 decimal places.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Number with at most 2 decimal places (float-safe: checks the literal representation). */
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  return /^-?\d+(\.\d{1,2})?$/.test(String(value));
}

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  contactName: z.string().trim().max(200).optional(),
  billingEmail: z.email("Enter a valid email"),
  ccEmails: z.array(z.email("Enter a valid email")).default([]),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(100).optional(),
  notes: z.string().max(5000).optional(),
  /** Auto-draft cadence in days (e.g. 14 = biweekly); null/undefined = off. */
  billingCadenceDays: z
    .number()
    .int("Whole days only")
    .min(1, "At least 1 day")
    .max(90, "At most 90 days")
    .nullable()
    .optional(),
  /** Per-client gate for the (globally-toggled) overdue reminder emails. */
  overdueRemindersEnabled: z.boolean().default(true),
  /** Invoice number prefix (INV-{PREFIX}-0001). Blank = derive from name. */
  invoicePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, "2–6 letters or digits")
    .optional()
    .or(z.literal("")),
  /** Payment-terms override: null/undefined = use the company default. */
  netDays: z.number().int("Whole days only").min(0).max(365).nullable().optional(),
  netDaysMode: z.enum(["BUSINESS", "CALENDAR"]).nullable().optional(),
});

export const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  quantity: z
    .number()
    .gt(0, "Hours must be greater than 0")
    .lte(99999.99, "Hours too large")
    .refine(hasAtMostTwoDecimalPlaces, "Up to 2 decimal places"),
  unitPriceCents: z
    .number()
    .int("Must be whole cents")
    .min(0, "Rate cannot be negative")
    .max(100_000_000, "Rate too large"),
});

export const invoiceSchema = z
  .object({
    clientId: z.string().min(1, "Select a client"),
    issueDate: z.string().regex(ISO_DATE_RE, "Use YYYY-MM-DD"),
    dueDate: z.string().regex(ISO_DATE_RE, "Use YYYY-MM-DD"),
    taxRateBps: z.number().int().min(0).max(10000),
    memo: z.string().max(5000).optional(),
    lineItems: z.array(lineItemSchema).min(1, "Add at least one line item"),
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: "Due date cannot be before issue date",
    path: ["dueDate"],
  });

export const settingsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  addressLine1: z.string().min(1, "Address is required"),
  addressLine2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  postalCode: z.string().min(1, "Postal code is required"),
  country: z.string().min(1, "Country is required"),
  email: z.email("Enter a valid email"),
  phone: z.string().optional(),
  payViaLabel: z.string().min(1, "Pay-via label is required"),
  paymentInstructions: z
    .string()
    .min(1, "Payment instructions are required")
    .max(5000),
  defaultTerms: z.string().optional(),
  defaultNetBusinessDays: z.number().int().min(0).max(365),
  defaultNetDaysMode: z.enum(["BUSINESS", "CALENDAR"]).default("BUSINESS"),
  defaultTaxRateBps: z.number().int().min(0).max(10000),
});

export const sendInvoiceSchema = z.object({
  to: z.email("Enter a valid email"),
  cc: z.array(z.email("Enter a valid email")).default([]),
});

export type ClientInput = z.infer<typeof clientSchema>;
export type LineItemInput = z.infer<typeof lineItemSchema>;
export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>;

// ============================================================
// Phase 2 — CFO layer
// ============================================================

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  kind: z.enum(["BANK", "CREDIT_CARD"]),
  institution: z.string().trim().min(1, "Institution is required").max(100),
  mask: z.string().trim().max(8).optional(),
  amountsAreCharges: z.boolean().default(false),
});

export const csvImportSchema = z.object({
  accountId: z.string().min(1),
  rows: z
    .array(
      z.object({
        dateIso: z.string().regex(ISO_DATE_RE, "Use YYYY-MM-DD"),
        amountCents: z.number().int(),
        description: z.string().min(1).max(500),
      })
    )
    .min(1, "Nothing to import")
    .max(5000, "Too many rows in one import"),
});

export const ruleSchema = z.object({
  field: z.enum(["DESCRIPTION", "MERCHANT"]).default("DESCRIPTION"),
  matchType: z.enum(["SUBSTRING", "REGEX"]).default("SUBSTRING"),
  pattern: z.string().trim().min(1, "Pattern is required").max(200),
  categoryId: z.string().min(1, "Pick a category"),
  priority: z.number().int().min(0).max(10000).default(100),
});

export const taxSettingsSchema = z.object({
  state: z.string().trim().max(30),
  federalRateBps: z.number().int().min(0).max(10000),
  stateRateBps: z.number().int().min(0).max(10000),
  ownerSalaryAnnualCents: z.number().int().min(0),
  withholdingYtdCents: z.number().int().min(0),
  cpaFiles1120S: z.boolean().nullable().optional(),
  payrollProvider: z.string().trim().max(100).optional(),
});

export const estimatePaymentSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  quarter: z.number().int().min(1).max(4),
  jurisdiction: z.enum(["FEDERAL", "STATE"]),
  paidDate: z.string().regex(ISO_DATE_RE, "Use YYYY-MM-DD"),
  amountCents: z.number().int().min(1, "Amount is required"),
  notes: z.string().max(500).optional(),
});

export type AccountInput = z.infer<typeof accountSchema>;
export type CsvImportInput = z.infer<typeof csvImportSchema>;
export type RuleInput = z.infer<typeof ruleSchema>;
export type TaxSettingsInput = z.infer<typeof taxSettingsSchema>;
export type EstimatePaymentInput = z.infer<typeof estimatePaymentSchema>;

// ============================================================
// Phase 3 — CRM / BD layer (all internal-only)
// ============================================================

export const CLIENT_STAGES = ["LEAD", "PROSPECT", "ACTIVE", "PAST"] as const;
export const CONTACT_ROLES = [
  "DECISION_MAKER",
  "CHAMPION",
  "INFLUENCER",
  "BLOCKER",
  "USER",
  "OTHER",
] as const;
export const INTERACTION_TYPES = ["EMAIL", "CALL", "MEETING", "NOTE"] as const;
export const INTERACTION_DIRECTIONS = ["INBOUND", "OUTBOUND", "INTERNAL"] as const;

/** A person mapped inside a client org. Empty strings normalize to null in the action. */
export const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  title: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  role: z.enum(CONTACT_ROLES).nullable().optional(),
  /** Manager (org chart). null = top of the tree for this client. */
  reportsToId: z.string().nullable().optional(),
  /** Personality / politics — INTERNAL. */
  notes: z.string().max(5000).optional().or(z.literal("")),
  isPrimary: z.boolean().default(false),
});

/** One manually-logged touch in the relationship timeline. */
export const interactionSchema = z.object({
  type: z.enum(INTERACTION_TYPES),
  direction: z.enum(INTERACTION_DIRECTIONS).default("OUTBOUND"),
  occurredAt: z.string().regex(ISO_DATE_RE, "Use YYYY-MM-DD"),
  contactId: z.string().nullable().optional(),
  subject: z.string().trim().max(300).optional().or(z.literal("")),
  body: z.string().max(5000).optional().or(z.literal("")),
});

/** Relationship stage (the coach reads this). */
export const clientStageSchema = z.enum(CLIENT_STAGES);

/** The next step + when it's due — drives the follow-up nudge. */
export const clientNextActionSchema = z.object({
  nextActionNote: z.string().trim().max(2000).optional().or(z.literal("")),
  nextActionDueDate: z.string().regex(ISO_DATE_RE, "Use YYYY-MM-DD").nullable().optional(),
});

/** Simple deal size + expected close (no separate Opportunity entity in v1). */
export const clientDealSchema = z.object({
  dealValueCents: z.number().int().min(0).max(100_000_000_00).nullable().optional(),
  expectedCloseDate: z.string().regex(ISO_DATE_RE, "Use YYYY-MM-DD").nullable().optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type InteractionInput = z.infer<typeof interactionSchema>;
export type ClientStage = (typeof CLIENT_STAGES)[number];
export type ClientNextActionInput = z.infer<typeof clientNextActionSchema>;
export type ClientDealInput = z.infer<typeof clientDealSchema>;
