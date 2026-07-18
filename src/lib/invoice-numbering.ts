import type { Prisma } from "@/generated/prisma/client";

/**
 * Invoice numbers are per-client: INV-{PREFIX}-{0001}, e.g. INV-ACME-0007.
 * The prefix is derived from the company name on first allocation (editable
 * on the client, stable across renames); the sequence is a per-client atomic
 * counter. Legacy invoices keep their global INV-0001 numbers.
 */

export function formatInvoiceNumber(prefix: string, n: number): string {
  return `INV-${prefix}-${String(n).padStart(4, "0")}`;
}

/** First 3–4 alphanumeric characters of the company name, uppercased. */
export function deriveInvoicePrefix(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (letters.slice(0, 4) || "CLNT").padEnd(2, "X");
}

/**
 * Allocate the next invoice number for a client atomically. Must run inside
 * the invoice-creation transaction. Ensures the client has a unique prefix
 * (deriving one from the name on first use, suffixing 2..9 on collisions).
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  clientId: string
): Promise<string> {
  const client = await tx.client.findUniqueOrThrow({
    where: { id: clientId },
    select: { name: true, invoicePrefix: true },
  });

  let prefix = client.invoicePrefix;
  if (!prefix) {
    const base = deriveInvoicePrefix(client.name);
    prefix = base;
    for (let i = 2; i <= 9; i++) {
      const taken = await tx.client.findUnique({
        where: { invoicePrefix: prefix },
        select: { id: true },
      });
      if (!taken) break;
      prefix = `${base}${i}`;
    }
    await tx.client.update({ where: { id: clientId }, data: { invoicePrefix: prefix } });
  }

  const updated = await tx.client.update({
    where: { id: clientId },
    data: { nextInvoiceNumber: { increment: 1 } },
    select: { nextInvoiceNumber: true },
  });
  return formatInvoiceNumber(prefix, updated.nextInvoiceNumber - 1);
}
