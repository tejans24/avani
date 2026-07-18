import type { Prisma } from "@/generated/prisma/client";
import { EVENT_SCHEMAS, type EventPayload, type EventType } from "./catalog";

/** Optional entity linkage per event type, derived from the payload. */
function entityRef(type: EventType, payload: Record<string, unknown>) {
  if ("invoiceId" in payload)
    return { entityType: "invoice", entityId: String(payload.invoiceId) };
  if ("transactionId" in payload)
    return { entityType: "transaction", entityId: String(payload.transactionId) };
  if ("accountId" in payload)
    return { entityType: "account", entityId: String(payload.accountId) };
  if ("deadlineKey" in payload)
    return { entityType: "deadline", entityId: String(payload.deadlineKey) };
  return { entityType: null, entityId: null };
}

/**
 * Write a domain event as part of the caller's transaction (outbox pattern).
 * The event commits — or rolls back — together with the state change, so the
 * log can never disagree with reality. Dispatching happens separately
 * (dispatch.ts), after commit.
 */
export async function emitEvent<T extends EventType>(
  tx: Prisma.TransactionClient,
  type: T,
  payload: EventPayload<T>
): Promise<void> {
  const parsed = EVENT_SCHEMAS[type].parse(payload);
  const ref = entityRef(type, parsed as Record<string, unknown>);
  await tx.domainEvent.create({
    data: {
      type,
      payload: parsed as object,
      entityType: ref.entityType,
      entityId: ref.entityId,
    },
  });
}
