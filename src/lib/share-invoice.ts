import { db } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";
import { dispatchSoon } from "@/lib/events/dispatch";

const VIEW_THROTTLE_MS = 24 * 3600_000;

/**
 * Resolve a share token to its invoice (with everything the public page
 * needs). Returns null for unknown/revoked tokens — the page 404s.
 * Security model: the 192-bit token IS the authorization; the page is
 * read-only and shows nothing the emailed PDF didn't already contain.
 */
export async function invoiceByShareToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return db.invoice.findUnique({
    where: { shareToken: token },
    include: {
      // PRIVACY: explicit select — the client-facing page only ever sees
      // billing identity, never the internal CRM layer (stage, next-action,
      // deal value, notes) and never contacts/interactions relations.
      client: {
        select: {
          id: true,
          name: true,
          contactName: true,
          billingEmail: true,
          ccEmails: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
}

/**
 * Record that the client opened the invoice page — at most one
 * invoice.viewed event per invoice per 24h, so refreshes don't flood the
 * activity feed. Never throws (a metrics failure must not break the page).
 */
export async function recordInvoiceView(invoice: {
  id: string;
  number: string;
  client: { name: string };
}): Promise<void> {
  try {
    const recent = await db.domainEvent.findFirst({
      where: {
        type: "invoice.viewed",
        entityId: invoice.id,
        createdAt: { gte: new Date(Date.now() - VIEW_THROTTLE_MS) },
      },
    });
    if (recent) return;
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "invoice.viewed", {
        invoiceId: invoice.id,
        number: invoice.number,
        clientName: invoice.client.name,
      });
    });
    dispatchSoon();
  } catch (e) {
    console.error("[share-invoice] view tracking failed:", e);
  }
}
