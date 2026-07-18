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
