import { db } from "@/lib/db";
import type { EventPayload, EventType } from "./catalog";

/**
 * Handler registry + dispatcher.
 *
 * Handlers are plain async functions registered via on() — never imported by
 * emit sites. This is the deliberate seam for a future move to a durable
 * runner (e.g. Inngest): swap the dispatcher, keep emit sites, catalog, and
 * handlers unchanged.
 *
 * Delivery semantics: at-least-once per handler. Each handler's outcome is
 * recorded in HandlerRun (unique on [eventId, handler]); a handler that
 * already succeeded is never re-run, a failed one is retried on the next
 * dispatch until MAX_ATTEMPTS. Handlers must be idempotent.
 */

export type HandlerCtx = { eventId: string; now: Date };
export type EventHandler<T extends EventType = EventType> = (
  payload: EventPayload<T>,
  ctx: HandlerCtx
) => Promise<void>;

type Registration = {
  type: EventType;
  name: string;
  handler: EventHandler<EventType>;
  /** When set, the handler only runs if this reactionSettings key is truthy. */
  settingKey?: string;
  /** Default for the settingKey when the user hasn't chosen yet. */
  settingDefault?: boolean;
};

const registry: Registration[] = [];

export function on<T extends EventType>(
  type: T,
  name: string,
  handler: EventHandler<T>,
  opts: { settingKey?: string; settingDefault?: boolean } = {}
) {
  registry.push({
    type,
    name,
    handler: handler as EventHandler<EventType>,
    settingKey: opts.settingKey,
    settingDefault: opts.settingDefault,
  });
}

export function registeredHandlers(): readonly Registration[] {
  return registry;
}

const MAX_ATTEMPTS = 5;

async function reactionEnabled(reg: Registration): Promise<boolean> {
  if (!reg.settingKey) return true;
  const settings = await db.companySettings.findUnique({
    where: { id: 1 },
    select: { reactionSettings: true },
  });
  const map = (settings?.reactionSettings ?? {}) as Record<string, boolean>;
  return map[reg.settingKey] ?? reg.settingDefault ?? false;
}

/**
 * Process all unprocessed events. Called fire-and-forget after actions and
 * from the tick sweep (the retry path). Safe to run concurrently at our
 * scale: HandlerRun's unique constraint makes double-execution a no-op race
 * loser, not a double effect (handlers are idempotent regardless).
 */
export async function dispatchPending(now = new Date()): Promise<{
  events: number;
  ran: number;
  failed: number;
}> {
  const events = await db.domainEvent.findMany({
    where: { processedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { handlerRuns: true },
  });

  let ran = 0;
  let failed = 0;

  for (const event of events) {
    const handlers = registry.filter((r) => r.type === event.type);
    let allOk = true;

    for (const reg of handlers) {
      const prior = event.handlerRuns.find((r) => r.handler === reg.name);
      if (prior?.status === "OK" || prior?.status === "SKIPPED") continue;

      try {
        if (!(await reactionEnabled(reg))) {
          await db.handlerRun.upsert({
            where: { eventId_handler: { eventId: event.id, handler: reg.name } },
            update: { status: "SKIPPED", error: null, ranAt: now },
            create: { eventId: event.id, handler: reg.name, status: "SKIPPED" },
          });
          continue;
        }
        await reg.handler(event.payload as never, { eventId: event.id, now });
        await db.handlerRun.upsert({
          where: { eventId_handler: { eventId: event.id, handler: reg.name } },
          update: { status: "OK", error: null, ranAt: now },
          create: { eventId: event.id, handler: reg.name, status: "OK" },
        });
        ran++;
      } catch (e) {
        allOk = false;
        failed++;
        await db.handlerRun.upsert({
          where: { eventId_handler: { eventId: event.id, handler: reg.name } },
          update: {
            status: "FAILED",
            error: e instanceof Error ? e.message : String(e),
            ranAt: now,
          },
          create: {
            eventId: event.id,
            handler: reg.name,
            status: "FAILED",
            error: e instanceof Error ? e.message : String(e),
          },
        });
      }
    }

    await db.domainEvent.update({
      where: { id: event.id },
      data: allOk
        ? { processedAt: now, attempts: { increment: 1 } }
        : { attempts: { increment: 1 } },
    });
  }

  return { events: events.length, ran, failed };
}

/** Fire-and-forget dispatch for use at the end of server actions. */
export function dispatchSoon() {
  void import("./register").then(() =>
    dispatchPending().catch((e) => console.error("[events] dispatch failed:", e))
  );
}
