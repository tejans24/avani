import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { dateToIso } from "@/lib/dates";
import type { InvoiceInput } from "@/lib/validations";
import { InvoiceForm } from "@/components/platform/invoice-form/InvoiceForm";

export const metadata = { title: "Edit invoice — Avani" };
export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params }: { params: { id: string } }) {
  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) notFound();
  if (invoice.status !== "DRAFT") redirect(`/invoices/${invoice.id}`);

  const [clients, settings] = await Promise.all([
    // Include the invoice's own client even if it has since been archived.
    db.client.findMany({
      where: { OR: [{ archived: false }, { id: invoice.clientId }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.companySettings.findUniqueOrThrow({ where: { id: 1 } }),
  ]);

  const input: InvoiceInput & { id: string } = {
    id: invoice.id,
    clientId: invoice.clientId,
    issueDate: dateToIso(invoice.issueDate),
    dueDate: dateToIso(invoice.dueDate),
    taxRateBps: invoice.taxRateBps,
    memo: invoice.memo ?? "",
    lineItems: invoice.lineItems.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPriceCents: item.unitPriceCents,
    })),
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Edit {invoice.number}</h1>
          <p className="sub">Only draft invoices can be edited.</p>
        </div>
      </div>

      <InvoiceForm
        clients={clients}
        defaults={{
          taxRateBps: settings.defaultTaxRateBps,
          netBusinessDays: settings.defaultNetBusinessDays,
          terms: settings.defaultTerms ?? "",
        }}
        invoice={input}
      />
    </>
  );
}
