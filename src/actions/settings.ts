"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { settingsSchema, type SettingsInput } from "@/lib/validations";

export type ActionResult = { ok: boolean; error?: string };

/** Load the CompanySettings singleton (id = 1). */
export async function getSettings() {
  await requireAuth();
  return db.companySettings.findUniqueOrThrow({ where: { id: 1 } });
}

/** Validate and persist company settings, then refresh /settings. */
export async function updateSettings(input: SettingsInput): Promise<ActionResult> {
  try {
    await requireAuth();

    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        ok: false,
        error: first ? `${first.path.join(".") || "form"}: ${first.message}` : "Invalid input.",
      };
    }

    const data = parsed.data;
    await db.companySettings.update({
      where: { id: 1 },
      data: {
        ...data,
        // Optional strings: empty/omitted clears the column instead of leaving it stale.
        addressLine2: data.addressLine2 || null,
        phone: data.phone || null,
        defaultTerms: data.defaultTerms || null,
      },
    });

    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Something went wrong saving settings.",
    };
  }
}
