import { db } from "@/lib/db";
import { ClientForm } from "@/components/platform/clients/ClientForm";

export const metadata = { title: "New client — Avani" };
export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const settings = await db.companySettings.findUniqueOrThrow({ where: { id: 1 } });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New client</h1>
          <p className="sub">Add a client to start invoicing them.</p>
        </div>
      </div>

      <ClientForm
        client={null}
        companyDefault={{
          netDays: settings.defaultNetBusinessDays,
          netDaysMode: settings.defaultNetDaysMode,
        }}
      />
    </>
  );
}
