import Link from "next/link";
import { db } from "@/lib/db";
import { InvoiceForm } from "@/components/platform/invoice-form/InvoiceForm";

export const metadata = { title: "New invoice — Avani" };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const [clients, settings] = await Promise.all([
    db.client.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.companySettings.findUniqueOrThrow({ where: { id: 1 } }),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New invoice</h1>
          <p className="sub">Draft an invoice — it can be reviewed and sent later.</p>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="empty-state">
          <p style={{ margin: "0 0 12px" }}>You need a client before you can create an invoice.</p>
          <Link href="/clients/new">Add your first client</Link>
        </div>
      ) : (
        <InvoiceForm
          clients={clients}
          defaults={{
            taxRateBps: settings.defaultTaxRateBps,
            netBusinessDays: settings.defaultNetBusinessDays,
            terms: settings.defaultTerms ?? "",
          }}
        />
      )}
    </>
  );
}
