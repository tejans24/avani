"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ALLOWED_KEYS = new Set(["overdueEmails"]);

/** Flip a reaction toggle stored in CompanySettings.reactionSettings. */
export async function updateReactionSetting(
  key: string,
  value: boolean
): Promise<ActionResult> {
  try {
    await requireAuth();
    if (!ALLOWED_KEYS.has(key) && !key.startsWith("notify:")) {
      return { ok: false, error: "Unknown setting" };
    }
    const settings = await db.companySettings.findUniqueOrThrow({
      where: { id: 1 },
      select: { reactionSettings: true },
    });
    const map: Record<string, boolean | string> = {
      ...(settings.reactionSettings as Record<string, boolean | string>),
    };
    map[key] = value;
    await db.companySettings.update({
      where: { id: 1 },
      data: { reactionSettings: map },
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.notification.update({ where: { id }, data: { readAt: new Date() } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.notification.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Reset a dead-lettered/failed event so the next dispatch retries its handlers. */
export async function retryEvent(eventId: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.$transaction([
      db.handlerRun.deleteMany({ where: { eventId, status: "FAILED" } }),
      db.domainEvent.update({
        where: { id: eventId },
        data: { attempts: 0, processedAt: null },
      }),
    ]);
    const { dispatchPending } = await import("@/lib/events/dispatch");
    await import("@/lib/events/register");
    await dispatchPending();
    revalidatePath("/activity");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
