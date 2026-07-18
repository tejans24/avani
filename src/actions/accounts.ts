"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { accountSchema, type AccountInput } from "@/lib/validations";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

/**
 * Create or update a financial account. Accounts created via the UI are
 * CSV-sourced (Mercury API accounts are provisioned by the sync, not here).
 */
export async function upsertAccount(
  id: string | null,
  input: AccountInput
): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = accountSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const data = { ...parsed.data, mask: parsed.data.mask || null };

    const account = id
      ? await db.financialAccount.update({ where: { id }, data })
      : await db.financialAccount.create({ data: { ...data, source: "CSV" } });

    revalidatePath("/accounts");
    return { ok: true, id: account.id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setAccountArchived(
  id: string,
  archived: boolean
): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.financialAccount.update({ where: { id }, data: { archived } });
    revalidatePath("/accounts");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
