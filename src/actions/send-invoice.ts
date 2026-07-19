"use server";

import { randomBytes } from "node:crypto";
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
import { emitEvent } from "@/lib/events/emit";
import { dispatchSoon } from "@/lib/events/dispatch";
import { dateToIso } from "@/lib/dates";

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

    // Unguessable client-link token (128 bits), minted once at first send.
    const shareToken =
      invoice.shareToken ?? randomBytes(24).toString("base64url");

    const emailData = {
      invoiceNumber: invoice.number,
      companyName: snapshot.companyName,
      clientName: invoice.client.contactName || invoice.client.name,
      totalCents: invoice.totalCents,
      dueDate: invoice.dueDate,
      payViaLabel: settings.payViaLabel,
      paymentInstructions: snapshot.paymentInstructions,
      shareUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/i/${shareToken}`,
    };

    const sent = await sendEmail({
      to: recipients.data.to,
      cc: recipients.data.cc,
      subject: buildInvoiceEmailSubject(emailData),
      html: buildInvoiceEmailHtml(emailData),
      attachments: [{ filename: `${invoice.number}.pdf`, content: buffer }],
    });
    if (!sent.ok) return sent;

    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: "SENT",
          sentAt: invoice.sentAt ?? new Date(),
          fromSnapshot: snapshot,
          shareToken,
        },
      });
      await emitEvent(tx, "invoice.sent", {
        invoiceId: id,
        number: invoice.number,
        clientId: invoice.client.id,
        clientName: invoice.client.name,
        totalCents: invoice.totalCents,
        dueDateIso: dateToIso(invoice.dueDate),
        resend: invoice.status === "SENT",
      });
    });
    dispatchSoon();

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
