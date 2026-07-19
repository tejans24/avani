import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import type { EventType } from "@/lib/events/catalog";

/**
 * Notification policy — the single gate between reactions and the owner.
 *
 * Handlers decide WHAT to say; this layer decides WHETHER and WHERE:
 * - "info"   → in-app only (activity bell)
 * - "action" → in-app + email (something is ready; one ask, one deep link)
 * - "urgent" → in-app + email + SMS (break-glass: imminent deadline w/ money)
 *
 * Keep-it-tight rules enforced here, not in handlers: SMS is capped by tier
 * assignment (only urgent), and per-type user overrides in
 * CompanySettings.reactionSettings ("notify:<type>": "off" | tier) win.
 */

export type NotifyTier = "info" | "action" | "urgent";

const DEFAULT_TIER: Record<EventType, NotifyTier> = {
  "invoice.sent": "info",
  "invoice.paid": "action",
  "invoice.voided": "info",
  "invoice.overdue": "action",
  "invoice.draft_prepared": "action",
  "transactions.imported": "info",
  "transaction.match_suggested": "action",
  "transaction.matched": "info",
  "payment.missing": "action",
  "taxes.quarter_approaching": "urgent",
  "compliance.window_open": "action",
  "invoice.reminder_sent": "info",
  "invoice.viewed": "info",
  "sync.failed": "action",
};

export type NotifyInput = {
  eventType: EventType;
  title: string;
  body?: string;
  href?: string;
};

export async function notify(input: NotifyInput): Promise<void> {
  const settings = await db.companySettings.findUnique({
    where: { id: 1 },
    select: { reactionSettings: true, email: true },
  });
  const prefs = (settings?.reactionSettings ?? {}) as Record<string, string>;
  const override = prefs[`notify:${input.eventType}`];
  if (override === "off") return;

  const tier: NotifyTier =
    override === "info" || override === "action" || override === "urgent"
      ? override
      : DEFAULT_TIER[input.eventType] ?? "info";

  // In-app: every non-off notification lands in the bell.
  const notification = await db.notification.create({
    data: {
      tier,
      title: input.title,
      body: input.body,
      href: input.href,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = input.href ? `${appUrl}${input.href}` : appUrl;
  // Channel outcomes recorded on the row so "I never got the email" is
  // diagnosable from the Health view. Delivery failure never throws — the
  // in-app notification already exists and handlers must not retry-loop on
  // a downed channel.
  const delivery: Record<string, string> = {};

  if (tier === "action" || tier === "urgent") {
    const ownerEmail = process.env.ALLOWED_EMAILS?.split(",")[0]?.trim();
    if (ownerEmail) {
      const sent = await sendEmail({
        to: ownerEmail,
        subject: `Avani: ${input.title}`,
        html: `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#211F1A;">${input.body ?? input.title}</p>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;"><a href="${link}" style="color:#B0532F;">Open in Avani →</a></p>`,
      });
      delivery.email = sent.ok === false ? `FAILED: ${sent.error}` : "SENT";
    }
  }

  if (tier === "urgent") {
    const sms = await sendSms(`Avani: ${input.title}${input.href ? ` ${link}` : ""}`);
    delivery.sms = sms.ok === false ? `FAILED: ${sms.error}` : "SENT";
  }

  if (Object.keys(delivery).length > 0) {
    await db.notification.update({
      where: { id: notification.id },
      data: { delivery },
    });
  }
}
