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
    const data = parsed.data;

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
