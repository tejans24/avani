import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { ContactInput } from "@/lib/validations";
import { ContactForm } from "@/components/platform/clients/ContactForm";

export const metadata = { title: "Edit contact — Avani" };
export const dynamic = "force-dynamic";

function managerLabel(c: { name: string; title: string | null }) {
  return c.title ? `${c.name} — ${c.title}` : c.name;
}

export default async function EditContactPage({
  params,
}: {
  params: { id: string; contactId: string };
}) {
  const contact = await db.contact.findUnique({ where: { id: params.contactId } });
  if (!contact || contact.clientId !== params.id) notFound();

  const client = await db.client.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!client) notFound();

  // A contact can't report to itself; exclude it from the manager options.
  const others = await db.contact.findMany({
    where: { clientId: params.id, archived: false, id: { not: contact.id } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, title: true },
  });
  const managerOptions = others.map((c) => ({ value: c.id, label: managerLabel(c) }));

  const input: ContactInput = {
    name: contact.name,
    title: contact.title ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    role: contact.role,
    reportsToId: contact.reportsToId,
    notes: contact.notes ?? "",
    isPrimary: contact.isPrimary,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Edit contact</h1>
          <p className="sub">
            {contact.name} · {client.name}
          </p>
        </div>
      </div>

      <ContactForm
        clientId={client.id}
        contact={input}
        contactId={contact.id}
        managerOptions={managerOptions}
      />
    </>
  );
}
