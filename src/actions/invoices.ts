"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { invoiceSchema, type InvoiceInput } from "@/lib/validations";
import { computeInvoiceTotals } from "@/lib/money";
import { isoToUtcDate, dateToIso, todayUtc, addBusinessDaysUtc } from "@/lib/dates";
import { allocateInvoiceNumber } from "@/lib/invoice-numbering";
import { shiftDescriptionDates } from "@/lib/shift-dates";
import { emitEvent } from "@/lib/events/emit";
import { dispatchSoon } from "@/lib/events/dispatch";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function invoicePaths(id?: string) {
  const paths = ["/dashboard", "/invoices", "/reports"];
  if (id) paths.push(`/invoices/${id}`);
  return paths;
}

function revalidateInvoices(id?: string) {
  for (const p of invoicePaths(id)) revalidatePath(p);
}

/** Build the shared create/update payload with server-computed totals. */
function buildInvoiceData(input: InvoiceInput) {
  const totals = computeInvoiceTotals(input.lineItems, input.taxRateBps);
  return {
    invoice: {
      issueDate: isoToUtcDate(input.issueDate),
      dueDate: isoToUtcDate(input.dueDate),
      taxRateBps: input.taxRateBps,
      memo: input.memo || null,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
    },
    lineItems: input.lineItems.map((item, i) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      amountCents: totals.lineAmountsCents[i],
      sortOrder: i,
    })),
  };
}

export async function createInvoice(input: InvoiceInput): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = invoiceSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { invoice, lineItems } = buildInvoiceData(parsed.data);

    const created = await db.$transaction(async (tx) => {
      const number = await allocateInvoiceNumber(tx, parsed.data.clientId);
      return tx.invoice.create({
        data: {
          ...invoice,
          number,
          clientId: parsed.data.clientId,
          lineItems: { create: lineItems },
        },
      });
    });

    revalidateInvoices(created.id);
    return { ok: true, id: created.id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function updateInvoice(
  id: string,
  input: InvoiceInput
): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = invoiceSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const existing = await db.invoice.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "DRAFT") {
      return { ok: false, error: "Only draft invoices can be edited." };
    }

    const { invoice, lineItems } = buildInvoiceData(parsed.data);
    await db.$transaction(async (tx) => {
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: {
          ...invoice,
          clientId: parsed.data.clientId,
          lineItems: { create: lineItems },
        },
      });
    });

    revalidateInvoices(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function deleteDraftInvoice(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const existing = await db.invoice.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "DRAFT") {
      return { ok: false, error: "Only draft invoices can be deleted. Void it instead." };
    }
    await db.invoice.delete({ where: { id } });
    revalidateInvoices();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function markInvoicePaid(
  id: string,
  paidAtIso?: string
): Promise<ActionResult> {
  try {
    await requireAuth();
    const existing = await db.invoice.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "SENT") {
      return { ok: false, error: "Only sent invoices can be marked as paid." };
    }
    const paidAt = paidAtIso ? isoToUtcDate(paidAtIso) : new Date();
    const client = await db.client.findUniqueOrThrow({
      where: { id: existing.clientId },
      select: { name: true },
    });
    // Conditional atomic transition: only ONE concurrent caller (manual mark vs.
    // an auto-match confirming the same invoice) can flip SENT->PAID, so
    // invoice.paid is emitted at most once. A stale check-then-update here
    // would let both fire the event -> double receipt / double CRM log.
    const flipped = await db.$transaction(async (tx) => {
      const res = await tx.invoice.updateMany({
        where: { id, status: "SENT" },
        data: { status: "PAID", paidAt },
      });
      if (res.count === 0) return false;
      await emitEvent(tx, "invoice.paid", {
        invoiceId: id,
        number: existing.number,
        clientName: client.name,
        totalCents: existing.totalCents,
        paidAtIso: dateToIso(paidAt),
        via: "manual",
      });
      return true;
    });
    if (!flipped) {
      return { ok: false, error: "This invoice was already marked paid." };
    }
    dispatchSoon();
    revalidateInvoices(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function voidInvoice(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const existing = await db.invoice.findUniqueOrThrow({ where: { id } });
    if (existing.status === "PAID") {
      return { ok: false, error: "Paid invoices cannot be voided." };
    }
    // Conditional flip: only DRAFT/SENT can be voided, atomically — so a void
    // racing a mark-paid (or a second void) can't both succeed. Clearing
    // shareToken revokes the client-facing link.
    const flipped = await db.$transaction(async (tx) => {
      const res = await tx.invoice.updateMany({
        where: { id, status: { in: ["DRAFT", "SENT"] } },
        data: { status: "VOID", shareToken: null },
      });
      if (res.count === 0) return false;
      await emitEvent(tx, "invoice.voided", { invoiceId: id, number: existing.number });
      return true;
    });
    if (!flipped) {
      return { ok: false, error: "This invoice can no longer be voided." };
    }
    dispatchSoon();
    revalidateInvoices(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Copy an invoice as a new DRAFT.
 * - No shiftDays: issue date = today, due date = today + default net business days.
 * - shiftDays (e.g. 14 for the biweekly cadence): shifts issue/due dates AND any
 *   MM/DD/YY date ranges inside line-item descriptions by that many days.
 */
export async function duplicateInvoice(
  id: string,
  opts: { shiftDays?: number } = {}
): Promise<ActionResult> {
  try {
    await requireAuth();
    const source = await db.invoice.findUniqueOrThrow({
      where: { id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    const shift = opts.shiftDays;
    let issueDate: Date;
    let dueDate: Date;
    if (shift != null) {
      issueDate = new Date(source.issueDate.getTime());
      issueDate.setUTCDate(issueDate.getUTCDate() + shift);
      dueDate = new Date(source.dueDate.getTime());
      dueDate.setUTCDate(dueDate.getUTCDate() + shift);
    } else {
      const settings = await db.companySettings.findUniqueOrThrow({ where: { id: 1 } });
      issueDate = todayUtc();
      dueDate = addBusinessDaysUtc(issueDate, settings.defaultNetBusinessDays);
    }

    const created = await db.$transaction(async (tx) => {
      const number = await allocateInvoiceNumber(tx, source.clientId);
      return tx.invoice.create({
        data: {
          number,
          clientId: source.clientId,
          status: "DRAFT",
          issueDate,
          dueDate,
          taxRateBps: source.taxRateBps,
          subtotalCents: source.subtotalCents,
          taxCents: source.taxCents,
          totalCents: source.totalCents,
          memo:
            shift != null && source.memo
              ? shiftDescriptionDates(source.memo, shift)
              : source.memo,
          lineItems: {
            create: source.lineItems.map((item, i) => ({
              description:
                shift != null
                  ? shiftDescriptionDates(item.description, shift)
                  : item.description,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              amountCents: item.amountCents,
              sortOrder: i,
            })),
          },
        },
      });
    });

    revalidateInvoices(created.id);
    return { ok: true, id: created.id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
