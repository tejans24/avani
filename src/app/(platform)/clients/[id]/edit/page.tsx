import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { ClientInput } from "@/lib/validations";
import { ClientForm } from "@/components/platform/clients/ClientForm";
import { ClientRowActions } from "@/components/platform/clients/ClientRowActions";

export const metadata = { title: "Edit client — Avani" };
export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const client = await db.client.findUnique({ where: { id: params.id } });
  if (!client) notFound();

  const input: ClientInput = {
    name: client.name,
    contactName: client.contactName ?? "",
    billingEmail: client.billingEmail,
    ccEmails: client.ccEmails,
    addressLine1: client.addressLine1 ?? "",
    addressLine2: client.addressLine2 ?? "",
    city: client.city ?? "",
    state: client.state ?? "",
    postalCode: client.postalCode ?? "",
    country: client.country ?? "",
    notes: client.notes ?? "",
    billingCadenceDays: client.billingCadenceDays,
    overdueRemindersEnabled: client.overdueRemindersEnabled,
    invoicePrefix: client.invoicePrefix ?? "",
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Edit client</h1>
          <p className="sub">{client.name}</p>
        </div>
        <ClientRowActions clientId={client.id} archived={client.archived} />
      </div>

      <ClientForm client={input} clientId={client.id} />
    </>
  );
}
