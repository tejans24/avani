"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { sendInvoiceSchema } from "@/lib/validations";
import {
  buildInvoicePdfData,
  renderInvoicePdfDataToBuffer,
  settingsToSnapshot,
} from "@/pdf/render";
import {
  buildInvoiceEmailHtml,
  buildInvoiceEmailSubject,
} from "@/emails/invoice-email";

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Send (or resend) an invoice to the client with the PDF attached.
 * On first send the current CompanySettings are frozen into fromSnapshot so
 * later settings edits never rewrite sent history. Status flips to SENT only
 * after the email service reports success.
 */
export async function sendInvoice(
  id: string,
  opts: { to?: string; cc?: string[] } = {}
): Promise<SendResult> {
  try {
    await requireAuth();

    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!invoice) return { ok: false, error: "Invoice not found." };
    if (invoice.status !== "DRAFT" && invoice.status !== "SENT") {
      return { ok: false, error: "Only draft or sent invoices can be sent." };
    }

    const recipients = sendInvoiceSchema.safeParse({
      to: opts.to ?? invoice.client.billingEmail,
      cc: opts.cc ?? invoice.client.ccEmails,
    });
    if (!recipients.success) {
      return {
        ok: false,
        error: recipients.error.issues[0]?.message ?? "Invalid recipient",
      };
    }

    const settings = await db.companySettings.findUniqueOrThrow({ where: { id: 1 } });

    // Freeze the From block on first send; keep the existing snapshot on resend.
    const snapshot =
      (invoice.fromSnapshot as ReturnType<typeof settingsToSnapshot> | null) ??
      settingsToSnapshot(settings);

    const pdfData = buildInvoicePdfData(
      { ...invoice, fromSnapshot: snapshot },
      settings
    );
    const buffer = await renderInvoicePdfDataToBuffer(pdfData);

    const emailData = {
      invoiceNumber: invoice.number,
      companyName: snapshot.companyName,
      clientName: invoice.client.contactName || invoice.client.name,
      totalCents: invoice.totalCents,
      dueDate: invoice.dueDate,
      payViaLabel: settings.payViaLabel,
      paymentInstructions: snapshot.paymentInstructions,
    };

    const sent = await sendEmail({
      to: recipients.data.to,
      cc: recipients.data.cc,
      subject: buildInvoiceEmailSubject(emailData),
      html: buildInvoiceEmailHtml(emailData),
      attachments: [{ filename: `${invoice.number}.pdf`, content: buffer }],
    });
    if (!sent.ok) return sent;

    await db.invoice.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: invoice.sentAt ?? new Date(),
        fromSnapshot: snapshot,
      },
    });

    for (const p of ["/dashboard", "/invoices", `/invoices/${id}`, "/reports"]) {
      revalidatePath(p);
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}
