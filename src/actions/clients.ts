"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { clientSchema, type ClientInput } from "@/lib/validations";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export async function upsertClient(
  id: string | null,
  input: ClientInput
): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = clientSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const data = {
      ...parsed.data,
      // The form always submits the field; a missing value means "off", so
      // normalize undefined -> null (undefined would leave a stale cadence
      // in place on update instead of clearing it).
      billingCadenceDays: parsed.data.billingCadenceDays ?? null,
      overdueRemindersEnabled: parsed.data.overdueRemindersEnabled,
      // Blank prefix = "derive from name at first allocation" (stored null).
      invoicePrefix: parsed.data.invoicePrefix || null,
    };

    if (data.invoicePrefix) {
      const clash = await db.client.findFirst({
        where: { invoicePrefix: data.invoicePrefix, NOT: id ? { id } : undefined },
        select: { name: true },
      });
      if (clash) {
        return { ok: false, error: `Prefix ${data.invoicePrefix} is already used by ${clash.name}.` };
      }
    }

    const client = id
      ? await db.client.update({ where: { id }, data })
      : await db.client.create({ data });

    revalidatePath("/clients");
    return { ok: true, id: client.id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setClientArchived(
  id: string,
  archived: boolean
): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.client.update({ where: { id }, data: { archived } });
    revalidatePath("/clients");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
