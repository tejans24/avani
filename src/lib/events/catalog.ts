import { z } from "zod";

/**
 * The event catalog — the vocabulary of the business.
 *
 * Every meaningful state change emits one of these facts, written in the SAME
 * database transaction as the change (outbox pattern, see emit.ts). The
 * DomainEvent table is append-only and doubles as the audit log / activity
 * feed. Reactions subscribe in register.ts; they never live at emit sites.
 */

export const EVENT_SCHEMAS = {
  "invoice.sent": z.object({
    invoiceId: z.string(),
    number: z.string(),
    clientId: z.string(),
    clientName: z.string(),
    totalCents: z.number().int(),
    dueDateIso: z.string(),
    resend: z.boolean().default(false),
  }),
  "invoice.paid": z.object({
    invoiceId: z.string(),
    number: z.string(),
    clientName: z.string(),
    totalCents: z.number().int(),
    paidAtIso: z.string(),
    via: z.enum(["match", "manual"]),
  }),
  "invoice.voided": z.object({
    invoiceId: z.string(),
    number: z.string(),
  }),
  "invoice.overdue": z.object({
    invoiceId: z.string(),
    number: z.string(),
    clientId: z.string(),
    clientName: z.string(),
    totalCents: z.number().int(),
    dueDateIso: z.string(),
    daysPast: z.number().int(),
  }),
  "invoice.draft_prepared": z.object({
    invoiceId: z.string(),
    number: z.string(),
    clientName: z.string(),
    totalCents: z.number().int(),
  }),
  "transactions.imported": z.object({
    accountId: z.string(),
    accountName: z.string(),
    source: z.enum(["MERCURY_API", "CSV"]),
    imported: z.number().int(),
    skipped: z.number().int(),
    categorized: z.number().int().default(0),
  }),
  "transaction.match_suggested": z.object({
    transactionId: z.string(),
    invoiceId: z.string(),
    invoiceNumber: z.string(),
    clientName: z.string(),
    amountCents: z.number().int(),
    confidence: z.enum(["HIGH", "MEDIUM"]),
  }),
  "transaction.matched": z.object({
    transactionId: z.string(),
    invoiceId: z.string(),
    invoiceNumber: z.string(),
  }),
  "payment.missing": z.object({
    invoiceId: z.string(),
    number: z.string(),
    clientName: z.string(),
    totalCents: z.number().int(),
    dueDateIso: z.string(),
  }),
  "taxes.quarter_approaching": z.object({
    year: z.number().int(),
    quarter: z.number().int(),
    dueDateIso: z.string(),
    estimatedRemainingCents: z.number().int(),
  }),
  "compliance.window_open": z.object({
    deadlineKey: z.string(),
    title: z.string(),
    dueDateIso: z.string(),
    daysUntil: z.number().int(),
  }),
  "invoice.reminder_sent": z.object({
    invoiceId: z.string(),
    number: z.string(),
    to: z.string(),
  }),
  "sync.failed": z.object({
    source: z.string(),
    error: z.string(),
  }),
} as const;

export type EventType = keyof typeof EVENT_SCHEMAS;
export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_SCHEMAS)[T]>;

export function parseEventPayload<T extends EventType>(
  type: T,
  payload: unknown
): EventPayload<T> {
  return EVENT_SCHEMAS[type].parse(payload) as EventPayload<T>;
}
