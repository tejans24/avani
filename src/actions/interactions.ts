"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { interactionSchema, type InteractionInput } from "@/lib/validations";
import { logInteraction } from "@/lib/interactions";
import { isoToUtcDate } from "@/lib/dates";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function orNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Manually log a touch (call/meeting/email/note) onto a client's timeline. */
export async function createInteraction(
  clientId: string,
  input: InteractionInput
): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = interactionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) return { ok: false, error: "Client not found" };

    // A named contact must belong to this client.
    const contactId = parsed.data.contactId || null;
    if (contactId) {
      const contact = await db.contact.findUnique({
        where: { id: contactId },
        select: { clientId: true },
      });
      if (!contact || contact.clientId !== clientId) {
        return { ok: false, error: "That contact isn't at this client." };
      }
    }

    await db.$transaction(async (tx) => {
      await logInteraction(tx, {
        clientId,
        contactId,
        type: parsed.data.type,
        direction: parsed.data.direction,
        occurredAt: isoToUtcDate(parsed.data.occurredAt),
        subject: orNull(parsed.data.subject),
        body: orNull(parsed.data.body),
        source: null, // manual
      });
    });

    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function deleteInteraction(id: string): Promise<ActionResult> {
  try {
    await requireAuth();
    const interaction = await db.interaction.delete({
      where: { id },
      select: { clientId: true },
    });
    revalidatePath(`/clients/${interaction.clientId}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
