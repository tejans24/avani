import type { Prisma } from "@/generated/prisma/client";
import type { InteractionType, InteractionDirection } from "@/lib/validations";

/**
 * Append one interaction to a client's timeline, inside the caller's
 * transaction. Auto-loggers (invoice sent, overdue reminder) call this within
 * the SAME $transaction as the state change + domain event, so the timeline
 * never disagrees with what actually happened. `source` distinguishes
 * auto-logged rows ("invoice.sent:INV-ACME-0001") from manual ones (null).
 */
export type LogInteractionInput = {
  clientId: string;
  contactId?: string | null;
  type: InteractionType;
  direction?: InteractionDirection;
  occurredAt?: Date;
  subject?: string | null;
  body?: string | null;
  source?: string | null;
};

export async function logInteraction(
  tx: Prisma.TransactionClient,
  input: LogInteractionInput
): Promise<void> {
  await tx.interaction.create({
    data: {
      clientId: input.clientId,
      contactId: input.contactId ?? null,
      type: input.type,
      direction: input.direction ?? "OUTBOUND",
      occurredAt: input.occurredAt ?? new Date(),
      subject: input.subject ?? null,
      body: input.body ?? null,
      source: input.source ?? null,
    },
  });
}
