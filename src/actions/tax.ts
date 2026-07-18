"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { isoToUtcDate } from "@/lib/dates";
import {
  estimatePaymentSchema,
  taxSettingsSchema,
  type EstimatePaymentInput,
  type TaxSettingsInput,
} from "@/lib/validations";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Validate and persist the TaxSettings singleton (id = 1), mirroring settings.ts. */
export async function updateTaxSettings(input: TaxSettingsInput): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = taxSettingsSchema.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        ok: false,
        error: first ? `${first.path.join(".") || "form"}: ${first.message}` : "Invalid input.",
      };
    }
    const data = {
      state: parsed.data.state,
      federalRateBps: parsed.data.federalRateBps,
      stateRateBps: parsed.data.stateRateBps,
      ownerSalaryAnnualCents: parsed.data.ownerSalaryAnnualCents,
      withholdingYtdCents: parsed.data.withholdingYtdCents,
      // null = "not sure" (distinct from an explicit yes/no).
      cpaFiles1120S: parsed.data.cpaFiles1120S ?? null,
      payrollProvider: parsed.data.payrollProvider || null,
    };
    await db.taxSettings.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
    revalidatePath("/reports/taxes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Record a quarterly estimated-tax payment. */
export async function recordEstimatePayment(
  input: EstimatePaymentInput
): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = estimatePaymentSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const created = await db.quarterlyEstimatePayment.create({
      data: {
        year: parsed.data.year,
        quarter: parsed.data.quarter,
        jurisdiction: parsed.data.jurisdiction,
        paidDate: isoToUtcDate(parsed.data.paidDate),
        amountCents: parsed.data.amountCents,
        notes: parsed.data.notes || null,
      },
    });
    revalidatePath("/reports/taxes");
    return { ok: true, id: created.id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Delete a recorded estimate payment. */
export async function deleteEstimatePayment(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.quarterlyEstimatePayment.delete({ where: { id } });
    revalidatePath("/reports/taxes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Enable/disable a compliance deadline (disabled ones never open windows). */
export async function setDeadlineEnabled(
  id: string,
  enabled: boolean
): Promise<ActionResult> {
  try {
    await requireAuth();
    await db.complianceDeadline.update({ where: { id }, data: { enabled } });
    revalidatePath("/reports/taxes");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
