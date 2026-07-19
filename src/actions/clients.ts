"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  clientSchema,
  clientStageSchema,
  clientNextActionSchema,
  clientDealSchema,
  type ClientInput,
  type ClientStage,
  type ClientNextActionInput,
  type ClientDealInput,
} from "@/lib/validations";
import { isoToUtcDate } from "@/lib/dates";

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
      // Blank terms = "use the company default" (stored null).
      netDays: parsed.data.netDays ?? null,
      netDaysMode: parsed.data.netDaysMode ?? null,
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

// --- BD coach mutations (edited from the client Overview BD card) ---

/** Move a client along the relationship pipeline (LEAD → … → PAST). */
export async function setClientStage(id: string, stage: ClientStage): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = clientStageSchema.safeParse(stage);
    if (!parsed.success) return { ok: false, error: "Invalid stage" };
    await db.client.update({ where: { id }, data: { stage: parsed.data } });
    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Set the next step + its due date. Changing either re-arms the follow-up
 * nudge (detect-bd keys on the client + due date), so editing the action
 * clears any stale "due" state.
 */
export async function setClientNextAction(
  id: string,
  input: ClientNextActionInput
): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = clientNextActionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const note = (parsed.data.nextActionNote ?? "").trim() || null;
    const dueDate = parsed.data.nextActionDueDate
      ? isoToUtcDate(parsed.data.nextActionDueDate)
      : null;
    await db.client.update({
      where: { id },
      data: { nextActionNote: note, nextActionDueDate: dueDate },
    });
    revalidatePath(`/clients/${id}`);
    revalidatePath("/dashboard");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Set the simple deal size + expected close (no separate Opportunity in v1). */
export async function setClientDeal(
  id: string,
  input: ClientDealInput
): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = clientDealSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const expectedCloseDate = parsed.data.expectedCloseDate
      ? isoToUtcDate(parsed.data.expectedCloseDate)
      : null;
    await db.client.update({
      where: { id },
      data: {
        dealValueCents: parsed.data.dealValueCents ?? null,
        expectedCloseDate,
      },
    });
    revalidatePath(`/clients/${id}`);
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
