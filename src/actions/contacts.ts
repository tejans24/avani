"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { contactSchema, type ContactInput } from "@/lib/validations";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Blank optional strings from the form → null in the DB. */
function orNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Create or update a contact under a client. Guards the org-chart edge:
 * a manager must belong to the SAME client, and a contact can't report to
 * itself. Enforces a single primary contact per client.
 */
export async function upsertContact(
  clientId: string,
  contactId: string | null,
  input: ContactInput
): Promise<ActionResult> {
  try {
    await requireAuth();
    const parsed = contactSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) return { ok: false, error: "Client not found" };

    const reportsToId = parsed.data.reportsToId || null;
    if (reportsToId) {
      if (reportsToId === contactId) {
        return { ok: false, error: "A contact can't report to themselves." };
      }
      const manager = await db.contact.findUnique({
        where: { id: reportsToId },
        select: { clientId: true },
      });
      if (!manager || manager.clientId !== clientId) {
        return { ok: false, error: "The selected manager isn't a contact at this client." };
      }
    }

    const data = {
      clientId,
      name: parsed.data.name,
      title: orNull(parsed.data.title),
      email: orNull(parsed.data.email),
      phone: orNull(parsed.data.phone),
      role: parsed.data.role ?? null,
      reportsToId,
      notes: orNull(parsed.data.notes),
      isPrimary: parsed.data.isPrimary,
    };

    const id = await db.$transaction(async (tx) => {
      const saved = contactId
        ? await tx.contact.update({ where: { id: contactId }, data })
        : await tx.contact.create({ data });
      // One primary per client: demote the others when this one is primary.
      if (data.isPrimary) {
        await tx.contact.updateMany({
          where: { clientId, id: { not: saved.id }, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return saved.id;
    });

    revalidatePath(`/clients/${clientId}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setContactArchived(
  contactId: string,
  archived: boolean
): Promise<ActionResult> {
  try {
    await requireAuth();
    const contact = await db.contact.update({
      where: { id: contactId },
      data: { archived },
      select: { clientId: true },
    });
    revalidatePath(`/clients/${contact.clientId}`);
    return { ok: true, id: contactId };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
