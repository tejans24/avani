import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ContactForm } from "@/components/platform/clients/ContactForm";

export const metadata = { title: "New contact — Avani" };
export const dynamic = "force-dynamic";

function managerLabel(c: { name: string; title: string | null }) {
  return c.title ? `${c.name} — ${c.title}` : c.name;
}

export default async function NewContactPage({ params }: { params: { id: string } }) {
  const client = await db.client.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!client) notFound();

  const contacts = await db.contact.findMany({
    where: { clientId: params.id, archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, title: true },
  });
  const managerOptions = contacts.map((c) => ({ value: c.id, label: managerLabel(c) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New contact</h1>
          <p className="sub">Map a person inside {client.name}.</p>
        </div>
      </div>

      <ContactForm clientId={client.id} contact={null} managerOptions={managerOptions} />
    </>
  );
}
