import type { Prisma } from "@/generated/prisma/client";

export function formatInvoiceNumber(n: number): string {
  return `INV-${String(n).padStart(4, "0")}`;
}

/**
 * Allocate the next invoice number atomically. Must run inside the same
 * transaction that creates the invoice — the atomic increment makes
 * concurrent allocations race-free without SELECT FOR UPDATE.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient
): Promise<string> {
  const settings = await tx.companySettings.update({
    where: { id: 1 },
    data: { nextInvoiceNumber: { increment: 1 } },
  });
  return formatInvoiceNumber(settings.nextInvoiceNumber - 1);
}
