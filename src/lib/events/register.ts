import { on } from "./dispatch";
import { notify } from "@/lib/notify";
import { db } from "@/lib/db";
import { emitEvent } from "./emit";
import { sendEmail } from "@/lib/email";
import { formatCents } from "@/lib/money";
import { formatDateLong } from "@/lib/dates";

/**
 * Reaction registrations — the ONLY place handlers are wired to events.
 * Handlers are plain (payload, ctx) functions: directly liftable into a
 * durable runner (Inngest et al.) later without touching emit sites.
 */

// --- Owner notifications (policy in notify.ts decides channels) ---

on("invoice.sent", "notify-owner", async (p) => {
  await notify({
    eventType: "invoice.sent",
    title: `Invoice ${p.number} ${p.resend ? "re-sent" : "sent"} to ${p.clientName} — ${formatCents(p.totalCents)}`,
    href: `/invoices/${p.invoiceId}`,
  });
});

on("invoice.paid", "notify-owner", async (p) => {
  await notify({
    eventType: "invoice.paid",
    title: `${p.clientName} paid ${p.number} — ${formatCents(p.totalCents)}`,
    body: p.via === "match" ? "Matched from a bank deposit." : "Marked paid manually.",
    href: `/invoices/${p.invoiceId}`,
  });
});

on("invoice.voided", "notify-owner", async (p) => {
  await notify({
    eventType: "invoice.voided",
    title: `Invoice ${p.number} voided`,
    href: `/invoices/${p.invoiceId}`,
  });
});

on("invoice.overdue", "notify-owner", async (p) => {
  await notify({
    eventType: "invoice.overdue",
    title: `${p.number} is ${p.daysPast} day${p.daysPast === 1 ? "" : "s"} overdue — ${p.clientName}, ${formatCents(p.totalCents)}`,
    href: `/invoices/${p.invoiceId}`,
  });
});

on("invoice.draft_prepared", "notify-owner", async (p) => {
  await notify({
    eventType: "invoice.draft_prepared",
    title: `Draft ${p.number} prepared for ${p.clientName} — review and send`,
    body: `Estimated ${formatCents(p.totalCents)} based on last period. Adjust hours, then send.`,
    href: `/invoices/${p.invoiceId}`,
  });
});

on("transactions.imported", "notify-owner", async (p) => {
  await notify({
    eventType: "transactions.imported",
    title: `${p.imported} transaction${p.imported === 1 ? "" : "s"} imported into ${p.accountName}` +
      (p.categorized > 0 ? ` (${p.categorized} auto-categorized)` : ""),
    href: `/transactions?account=${p.accountId}`,
  });
});

on("transaction.match_suggested", "notify-owner", async (p) => {
  await notify({
    eventType: "transaction.match_suggested",
    title: `${formatCents(p.amountCents)} deposit looks like ${p.clientName}'s payment for ${p.invoiceNumber}`,
    body: "Confirm to mark the invoice paid.",
    href: `/transactions`,
  });
});

on("payment.missing", "notify-owner", async (p) => {
  await notify({
    eventType: "payment.missing",
    title: `No payment seen for ${p.number} — ${p.clientName}, ${formatCents(p.totalCents)} (due ${formatDateLong(p.dueDateIso)})`,
    href: `/invoices/${p.invoiceId}`,
  });
});

on("taxes.quarter_approaching", "notify-owner", async (p) => {
  await notify({
    eventType: "taxes.quarter_approaching",
    title: `Q${p.quarter} estimated tax due ${formatDateLong(p.dueDateIso)} — about ${formatCents(p.estimatedRemainingCents)} remaining`,
    href: `/reports/taxes`,
  });
});

on("compliance.window_open", "notify-owner", async (p) => {
  await notify({
    eventType: "compliance.window_open",
    title: `${p.title} due ${formatDateLong(p.dueDateIso)} (${p.daysUntil} days)`,
    body: "Preparation window is open.",
    href: `/reports/taxes`,
  });
});

on("sync.failed", "notify-owner", async (p) => {
  await notify({
    eventType: "sync.failed",
    title: `${p.source} sync failed`,
    body: p.error,
    href: `/accounts`,
  });
});

// --- Client-facing: overdue reminder email (BUILT but default OFF) ---

const REMINDER_GAP_DAYS = 7;

on(
  "invoice.overdue",
  "email-client-reminder",
  async (p, ctx) => {
    const invoice = await db.invoice.findUnique({
      where: { id: p.invoiceId },
      include: { client: true },
    });
    // Idempotence + state guards: still sent, client opted in, no recent reminder.
    if (!invoice || invoice.status !== "SENT") return;
    if (!invoice.client.overdueRemindersEnabled) return;

    const gapCutoff = new Date(ctx.now.getTime() - REMINDER_GAP_DAYS * 86400_000);
    const recent = await db.domainEvent.findFirst({
      where: {
        type: "invoice.reminder_sent",
        entityId: p.invoiceId,
        createdAt: { gte: gapCutoff },
      },
    });
    if (recent) return;

    const settings = await db.companySettings.findUniqueOrThrow({ where: { id: 1 } });
    const sent = await sendEmail({
      to: invoice.client.billingEmail,
      cc: invoice.client.ccEmails,
      subject: `Reminder: invoice ${p.number} from ${settings.companyName} — ${formatCents(p.totalCents)}`,
      html: `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#211F1A;">
Hi ${invoice.client.contactName || invoice.client.name},<br/><br/>
A friendly reminder that invoice ${p.number} for ${formatCents(p.totalCents)} was due on
${formatDateLong(p.dueDateIso)}. If payment is already on its way, please disregard this note.<br/><br/>
${settings.paymentInstructions.replace(/\n/g, "<br/>")}<br/><br/>
Thank you!<br/>${settings.companyName}</p>`,
    });
    if (sent.ok === false) throw new Error(sent.error);

    await db.$transaction(async (tx) => {
      await emitEvent(tx, "invoice.reminder_sent", {
        invoiceId: p.invoiceId,
        number: p.number,
        to: invoice.client.billingEmail,
      });
    });
  },
  { settingKey: "overdueEmails", settingDefault: false }
);
